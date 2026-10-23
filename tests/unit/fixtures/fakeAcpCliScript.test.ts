/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const CLI = path.resolve(__dirname, '../../fixtures/fake-acp-cli/index.js');
const tmpDirs: string[] = [];

const tmp = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-acp-'));
  tmpDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

type RpcMessage = { id?: number; method?: string; result?: Record<string, unknown>; error?: { message: string } };

/** Run one initialize → session/new(cwd) → session/prompt exchange. */
const runSession = (args: string[], env: Record<string, string>, cwd: string): Promise<RpcMessage[]> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, ...env } });
    const messages: RpcMessage[] = [];
    let buffer = '';
    const send = (msg: object) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('fake-acp-cli timed out'));
    }, 10_000);
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as RpcMessage;
        messages.push(msg);
        if (msg.id === 1) send({ id: 2, method: 'session/new', params: { cwd, mcpServers: [] } });
        if (msg.id === 2) {
          const sessionId = msg.result?.sessionId;
          send({ id: 3, method: 'session/prompt', params: { sessionId, prompt: [{ type: 'text', text: 'fix it' }] } });
        }
        if (msg.id === 3) {
          clearTimeout(timer);
          child.kill();
          resolve(messages);
        }
      }
    });
    send({ id: 1, method: 'initialize', params: { protocolVersion: 1 } });
  });

const replyText = (messages: RpcMessage[]): string =>
  messages
    .filter((m) => m.method === 'session/update')
    .map((m) => (m as { params: { update: { content: { text: string } } } }).params.update.content.text ?? '')
    .join('');

describe('fake-acp-cli script-write mode', () => {
  it('writes the scripted files into the session cwd and replies with the script text', async () => {
    const worktree = tmp();
    const script = path.join(tmp(), 'slot-a.json');
    fs.writeFileSync(script, JSON.stringify({ writes: { 'src/fix.txt': 'fixed\n' }, reply: 'Slot A fixed it' }));

    const messages = await runSession(['--script', script], {}, worktree);

    expect(fs.readFileSync(path.join(worktree, 'src/fix.txt'), 'utf8')).toBe('fixed\n');
    expect(replyText(messages)).toBe('Slot A fixed it');
    expect(messages.find((m) => m.id === 3)?.result?.stopReason).toBe('end_turn');
  });

  it('reads the script from FAKE_ACP_SCRIPT and refuses paths outside cwd', async () => {
    const worktree = tmp();
    const script = path.join(tmp(), 'evil.json');
    fs.writeFileSync(script, JSON.stringify({ writes: { '../escape.txt': 'no' } }));

    const messages = await runSession([], { FAKE_ACP_SCRIPT: script }, worktree);

    expect(messages.find((m) => m.id === 3)?.error?.message).toContain('outside cwd');
    expect(fs.existsSync(path.join(worktree, '..', 'escape.txt'))).toBe(false);
  });

  it('keeps the plain echo behaviour without a script', async () => {
    const worktree = tmp();
    const messages = await runSession([], { FAKE_ACP_SCRIPT: '' }, worktree);
    expect(replyText(messages)).toBe('Fake response to: fix it');
    expect(fs.readdirSync(worktree)).toEqual([]);
  });
});
