/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M7 E4-6: commit → push → pull request through the real app + Core, with a
 * local bare remote and a fake `gh` first on Core's PATH. Nothing leaves the
 * machine: `origin` reports a GitHub URL (provider detection) but pushes to a
 * bare repo, and the fake `gh` records its argv / stdin instead of calling the
 * network.
 *
 * The dialog's guidance states are covered by DOM tests
 * (tests/unit/renderer/createPullRequestModal.dom.test.tsx); this spec pins the
 * Core contract the dialog relies on, end to end.
 *
 * POSIX only for now (see fakeHostCli.ts); the three-platform matrix is wired
 * separately.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ElectronApplication, Page } from 'playwright';

import { expect, launchApp, test } from '../../fixtures';
import { createFakeHostCli, pathWith } from '../../helpers/fakeHostCli';
import { createGitRemoteFixture, remoteBranchSha } from '../../helpers/gitRemoteFixture';
import { httpGet, httpPost } from '../../helpers/httpBridge';

type HostStatus = {
  provider: string;
  host?: string;
  remote?: string;
  cli?: string | null;
  installed: boolean;
  authenticated: boolean;
};
type CreateResult = { pr_url: string; pr_number?: string; provider: string; evidence_id?: string };
type Delivery = { id: string; branch: string; commit_sha?: string; provider: string; pr_url?: string };

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

/** `pe:` scope id of the conversation's workspace root. */
async function workspaceScope(page: Page, workDir: string): Promise<string> {
  const assistants = await httpGet<Array<{ id: string }>>(page, '/api/assistants');
  expect(assistants.length).toBeGreaterThan(0);
  const conversation = await httpPost<{ id: string }>(page, '/api/conversations', {
    name: `E4-6 delivery ${Date.now()}`,
    assistant: { id: assistants[0].id },
    extra: { workspace: workDir, custom_workspace: true },
  });
  const detail = await httpGet<{ project_id?: string }>(page, `/api/conversations/${conversation.id}`);
  expect(detail.project_id).toBeTruthy();
  const project = await httpGet<{ explorer: { workspace_pe_id: string } }>(page, `/api/projects/${detail.project_id}`);
  return `pe:${project.explorer.workspace_pe_id}`;
}

test.describe('M7 E4-6 commit → push → pull request', () => {
  test.skip(process.platform === 'win32', 'fake gh is a POSIX script; Windows needs a compiled stub');

  let root: string;
  let app: ElectronApplication | undefined;

  test.beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'csbu-e2e-delivery-'));
  });

  test.afterAll(async () => {
    await app?.close().catch(() => undefined);
  });

  test('guides login, then opens the PR for the pushed branch and records the delivery', async () => {
    test.setTimeout(300_000);
    const gh = createFakeHostCli(path.join(root, 'gh'), { authenticated: false });
    const repo = createGitRemoteFixture(path.join(root, 'repo'));

    app = await launchApp({
      PATH: pathWith(gh.binDir),
      CSBU_WORKMATE_E2E_USER_DATA_DIR: path.join(root, 'user-data'),
      CSBU_WORKMATE_CDP_PORT: '0',
    });
    const page = await mainWindow(app);
    const repoPath = await workspaceScope(page, repo.workDir);
    const q = (p: string, extra = '') => `${p}?repo_path=${encodeURIComponent(repoPath)}${extra}`;

    // Signed out: the dialog shows the login guide.
    const signedOut = await httpGet<HostStatus>(page, q('/api/scm-deliveries/host'));
    expect(signedOut).toMatchObject({
      provider: 'github',
      host: 'github.com',
      remote: 'origin',
      cli: 'gh',
      installed: true,
      authenticated: false,
    });

    // Commit + push a feature branch (push goes to the local bare remote).
    repo.git('switch', '-q', '-c', 'feat/e2e-delivery');
    fs.writeFileSync(path.join(repo.workDir, 'feature.txt'), 'delivered\n');
    repo.git('add', 'feature.txt');
    repo.git('commit', '-q', '-m', 'feat: e2e delivery');
    repo.git('push', '-q', '-u', 'origin', 'feat/e2e-delivery');
    const head = repo.git('rev-parse', 'HEAD');
    expect(remoteBranchSha(repo.bareDir, 'feat/e2e-delivery')).toBe(head);

    const request = {
      repo_path: repoPath,
      branch: 'feat/e2e-delivery',
      base: 'main',
      title: 'E2E delivery',
      body: 'Opened by the E2E suite.\n\n- feature.txt',
      draft: true,
    };
    await expect(httpPost(page, '/api/scm-deliveries/pull-request', request)).rejects.toThrow(
      /\(409\).*PR_CLI_NOT_AUTHENTICATED/
    );

    // After `gh auth login` the re-check turns the guide into the form.
    gh.setAuthenticated(true);
    await expect
      .poll(async () => (await httpGet<HostStatus>(page, q('/api/scm-deliveries/host'))).authenticated)
      .toBe(true);

    // A run id that is not this user's is refused before the CLI runs.
    const before = gh.calls().length;
    await expect(
      httpPost(page, '/api/scm-deliveries/pull-request', {
        ...request,
        task_session_id: 'missing-task',
        run_id: 'missing-run',
      })
    ).rejects.toThrow(/\(404\).*PR_TASK_RUN_NOT_FOUND/);
    expect(
      gh
        .calls()
        .slice(before)
        .some((call) => call.argv[0] === 'pr')
    ).toBe(false);

    const created = await httpPost<CreateResult>(page, '/api/scm-deliveries/pull-request', request);
    expect(created).toMatchObject({ pr_url: gh.prUrl, pr_number: '1', provider: 'github' });

    const create = gh.calls().find((call) => call.argv[0] === 'pr' && call.argv[1] === 'create');
    expect(create?.argv).toEqual([
      'pr',
      'create',
      '--head',
      'feat/e2e-delivery',
      '--base',
      'main',
      '--title',
      'E2E delivery',
      '--body-file',
      '-',
      '--draft',
    ]);
    expect(create?.stdin).toBe(request.body);
    expect(fs.realpathSync(create!.cwd)).toBe(fs.realpathSync(repo.workDir));

    const deliveries = await httpGet<Delivery[]>(page, q('/api/scm-deliveries', '&limit=5'));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      branch: 'feat/e2e-delivery',
      commit_sha: head,
      provider: 'github',
      pr_url: gh.prUrl,
    });
  });
});
