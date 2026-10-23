/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M7 E3-6: fan-out best-of-3 through the real app + Core.
 *
 * Three custom ACP agents run tests/fixtures/fake-acp-cli in script-write mode,
 * each with its own script (A and B fix bug.txt, C writes a wrong fix). Core
 * creates one worktree per slot and sends the prompt to every slot; the fake
 * agent writes its file into its own worktree. The spec then checks the group
 * page and the compare matrix in the UI, adopts B with `branch_only` from the
 * adopt dialog, and verifies the source repo is untouched, B's branch carries
 * the fix, and the other slots' worktrees are gone.
 *
 * POSIX only: the fake agent is a node shebang script.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ElectronApplication, Page } from 'playwright';

import { expect, launchApp, test } from '../../fixtures';
import { navigateTo } from '../../helpers';
import { httpGet, httpPost } from '../../helpers/httpBridge';

const FAKE_ACP = path.resolve(__dirname, '../../../fixtures/fake-acp-cli/index.js');

type Slot = { slot: string; status: string; branch: string; path: string; conversation_id?: string };
type Group = { id: string; status: string; slots: Slot[] };
type Compare = { files: Array<{ path: string; slots: Record<string, { status: string }> }> };

async function mainWindow(app: ElectronApplication): Promise<Page> {
  const existing = app.windows().find((window) => !window.url().startsWith('devtools://'));
  const page = existing ?? (await app.waitForEvent('window', { timeout: 60_000 }));
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => {
      const port = (window as unknown as { __backendPort?: number }).__backendPort;
      return typeof port === 'number' && port > 0;
    },
    undefined,
    { timeout: 60_000 }
  );
  return page;
}

test.describe('M7 E3-6 fan-out best-of-3', () => {
  test.skip(process.platform === 'win32', 'fake ACP agent is a POSIX script');

  let root: string;
  let app: ElectronApplication | undefined;

  test.beforeAll(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'csbu-e2e-fanout-')));
  });

  test.afterAll(async () => {
    await app?.close().catch(() => undefined);
  });

  test('create → run → compare → adopt branch_only → losers cleaned', async () => {
    test.setTimeout(300_000);
    const repo = path.join(root, 'repo');
    fs.mkdirSync(repo, { recursive: true });
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
    fs.writeFileSync(path.join(repo, 'bug.txt'), 'broken\n');
    git('init', '-q', '-b', 'main');
    git('-c', 'user.name=e2e', '-c', 'user.email=e2e@example.invalid', 'add', '.');
    git('-c', 'user.name=e2e', '-c', 'user.email=e2e@example.invalid', 'commit', '-q', '-m', 'base');
    const base = git('rev-parse', 'HEAD');

    app = await launchApp({
      CSBU_WORKMATE_E2E_USER_DATA_DIR: path.join(root, 'user-data'),
      CSBU_WORKMATE_CDP_PORT: '0',
    });
    const page = await mainWindow(app);

    // One fake agent + assistant per slot, each with its own write script.
    const fixes: Record<string, string> = { A: 'fixed by A\n', B: 'fixed by B\n', C: 'wrong\n' };
    const assistantIds = await Promise.all(
      Object.entries(fixes).map(async ([label, content]) => {
        const script = path.join(root, `script-${label}.json`);
        fs.writeFileSync(script, JSON.stringify({ writes: { 'bug.txt': content }, reply: `slot ${label} done` }));
        const agent = await httpPost<{ id: string }>(page, '/api/agents/custom', {
          name: `E2E Fanout ${label}`,
          command: FAKE_ACP,
          args: ['--script', script],
          env: [],
        });
        const assistant = await httpPost<{ id: string }>(page, '/api/assistants', {
          name: `E2E Fanout ${label} ${Date.now()}`,
          agent_id: agent.id,
        });
        return assistant.id;
      })
    );

    const created = await httpPost<Group>(page, '/api/fanout-groups', {
      repo_path: repo,
      prompt: 'fix bug.txt',
      title: 'E2E best-of-3',
      slots: assistantIds.map((assistant_id) => ({ assistant_id })),
    });
    expect(created.slots.map((slot) => slot.slot)).toEqual(['A', 'B', 'C']);

    // Every slot finishes after its agent wrote into its own worktree.
    let group = created;
    await expect
      .poll(
        async () => {
          group = await httpGet<Group>(page, `/api/fanout-groups/${created.id}`);
          return group.slots.map((slot) => slot.status);
        },
        { timeout: 180_000, intervals: [1_000] }
      )
      .toEqual(['finished', 'finished', 'finished']);
    for (const slot of group.slots) {
      expect(fs.realpathSync(slot.path)).not.toBe(repo);
      expect(fs.readFileSync(path.join(slot.path, 'bug.txt'), 'utf8')).toBe(fixes[slot.slot]);
    }

    const compare = await httpGet<Compare>(page, `/api/fanout-groups/${created.id}/compare`);
    const bugRow = compare.files.find((row) => row.path === 'bug.txt');
    expect(Object.keys(bugRow?.slots ?? {}).toSorted()).toEqual(['A', 'B', 'C']);

    // UI: sidebar entry, group page, three slot cards, compare matrix, B's diff.
    await expect(page.getByTestId(`fanout-sider-item-${created.id}`).first()).toBeVisible({ timeout: 30_000 });
    await navigateTo(page, `#/fanout/${created.id}`);
    await expect(page.getByTestId('fanout-group-page')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('fanout-slot-card')).toHaveCount(3);
    await expect(page.getByTestId('fanout-file-matrix')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('fanout-cell-B').first().click();
    await expect(page.getByTestId('fanout-file-diff')).toContainText('fixed by B', { timeout: 30_000 });
    await page.keyboard.press('Escape');

    // Adopt B with the dialog's default strategy (branch_only).
    const cardB = page.getByTestId('fanout-slot-card').filter({ has: page.getByText('B', { exact: true }) });
    await cardB.locator('button.arco-btn-primary').click();
    const dialog = page.locator('.arco-modal').filter({ has: page.getByTestId('fanout-adopt-no-hooks') });
    await expect(dialog).toBeVisible();
    await dialog.locator('.arco-modal-footer .arco-btn-primary').click();
    await expect(page.getByTestId('fanout-adopt-result')).toBeVisible({ timeout: 60_000 });

    // Acceptance ①: source repo untouched, winner branch carries the fix, losers cleaned.
    const slotB = group.slots.find((slot) => slot.slot === 'B')!;
    expect(git('rev-parse', 'HEAD')).toBe(base);
    expect(git('status', '--porcelain')).toBe('');
    expect(git('show', `${slotB.branch}:bug.txt`)).toBe('fixed by B');
    const adopted = await httpGet<Group>(page, `/api/fanout-groups/${created.id}`);
    expect(adopted.status).toBe('adopted');
    for (const slot of group.slots.filter((s) => s.slot !== 'B')) {
      expect(fs.existsSync(slot.path), `slot ${slot.slot} worktree removed`).toBe(false);
    }
  });
});
