/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M7 E4-6: annotate → send → agent revises, through the real app + Core.
 *
 * A custom ACP agent (tests/fixtures/fake-acp-reviser) is registered and bound
 * to an assistant. A review thread is left on a workspace file and sent as a
 * batch to the conversation. The fake agent parses the `[[AION_REVIEW ...]]`
 * block Core delivers, and applies each `REPLACE: old => new` annotation to the
 * file. The spec then checks the delivered prompt, the file on disk, and the
 * thread's `sent` status.
 *
 * POSIX only: the agent is a node shebang script.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ElectronApplication, Page } from 'playwright';

import { expect, launchApp, test } from '../../fixtures';
import { httpGet, httpPost } from '../../helpers/httpBridge';

const REVISER = path.resolve(__dirname, '../../../fixtures/fake-acp-reviser/index.js');

type Thread = { id: string; status: string; file_path: string };
type BatchResult = { batch: { id: string; status: string; content: string } };
type PromptLog = { sessionId: string; cwd: string; text: string; applied: string[] };

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

function readLog(file: string): PromptLog[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PromptLog);
}

test.describe('M7 E4-6 annotate → send → revise', () => {
  test.skip(process.platform === 'win32', 'fake ACP agent is a POSIX script');

  let root: string;
  let app: ElectronApplication | undefined;

  test.beforeAll(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'csbu-e2e-revise-')));
  });

  test.afterAll(async () => {
    await app?.close().catch(() => undefined);
  });

  test('the agent receives the annotation batch and revises the file', async () => {
    test.setTimeout(300_000);
    const workDir = path.join(root, 'repo');
    const file = path.join(workDir, 'src', 'lib.rs');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const original = ['pub fn add(a: i32, b: i32) -> i32 {', '    a - b', '}', ''].join('\n');
    fs.writeFileSync(file, original);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: workDir, encoding: 'utf8' }).trim();
    git('init', '-q', '-b', 'main');
    git('-c', 'user.name=e2e', '-c', 'user.email=e2e@example.invalid', 'add', '.');
    git('-c', 'user.name=e2e', '-c', 'user.email=e2e@example.invalid', 'commit', '-q', '-m', 'init');
    const promptLog = path.join(root, 'prompts.jsonl');

    app = await launchApp({
      CSBU_WORKMATE_E2E_USER_DATA_DIR: path.join(root, 'user-data'),
      CSBU_WORKMATE_CDP_PORT: '0',
    });
    const page = await mainWindow(app);

    // Register the reviser as a custom ACP agent and bind an assistant to it.
    const agent = await httpPost<{ id: string }>(page, '/api/agents/custom', {
      name: 'E2E Reviser',
      command: REVISER,
      args: [],
      env: [{ name: 'FAKE_ACP_LOG', value: promptLog }],
    });
    const assistant = await httpPost<{ id: string }>(page, '/api/assistants', {
      name: `E2E Reviser ${Date.now()}`,
      agent_id: agent.id,
    });
    const conversation = await httpPost<{ id: string }>(page, '/api/conversations', {
      name: 'E4-6 revise',
      assistant: { id: assistant.id },
      extra: { workspace: workDir, custom_workspace: true },
    });
    const detail = await httpGet<{ project_id?: string }>(page, `/api/conversations/${conversation.id}`);
    expect(detail.project_id).toBeTruthy();
    const project = await httpGet<{ explorer: { workspace_pe_id: string } }>(
      page,
      `/api/projects/${detail.project_id}`
    );
    const scopeId = `pe:${project.explorer.workspace_pe_id}`;

    // Annotate line 2 of src/lib.rs.
    const thread = await httpPost<Thread>(page, '/api/review-threads', {
      scope_kind: 'scm',
      scope_id: scopeId,
      conversation_id: conversation.id,
      file_path: 'src/lib.rs',
      side: 'new',
      start_line: 2,
      end_line: 2,
      body: 'REPLACE: a - b => a + b',
      diff_context: { before: ['pub fn add(a: i32, b: i32) -> i32 {'], lines: ['    a - b'], after: ['}'] },
    });
    expect(thread.status).toBe('open');

    // Send the batch to the conversation.
    const sent = await httpPost<BatchResult>(page, '/api/review-batches', {
      target_conversation_id: conversation.id,
      scope_kind: 'scm',
      scope_id: scopeId,
      thread_ids: [thread.id],
    });
    expect(sent.batch.status).toBe('accepted');
    expect(sent.batch.content).toContain(`[[AION_REVIEW batch=${sent.batch.id} count=1]]`);
    expect(sent.batch.content).toMatch(/^#1 src\/lib\.rs {2}L2/m);
    expect(sent.batch.content).toContain('批注：REPLACE: a - b => a + b');

    // The agent receives exactly that batch and revises the file in the workspace.
    await expect.poll(() => fs.readFileSync(file, 'utf8'), { timeout: 120_000 }).toContain('    a + b');
    expect(fs.readFileSync(file, 'utf8')).toBe(original.replace('a - b', 'a + b'));
    const revised = readLog(promptLog).find((entry) => entry.text.includes('[[AION_REVIEW'));
    expect(revised, 'the agent got the review batch').toBeTruthy();
    expect(revised?.text).toContain(`batch=${sent.batch.id}`);
    expect(fs.realpathSync(revised!.cwd)).toBe(workDir);
    expect(revised?.applied).toEqual(['src/lib.rs']);

    // The annotation is marked sent.
    const threads = await httpGet<Thread[]>(
      page,
      `/api/review-threads?scope_kind=scm&scope_id=${encodeURIComponent(scopeId)}`
    );
    expect(threads.find((t) => t.id === thread.id)?.status).toBe('sent');
  });
});
