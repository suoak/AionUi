/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  ATTACHED_TERMINAL_CONTEXT_MAX_CHARS,
  appendAttachedTerminalContext,
  collectAttachedTerminalContext,
  formatAttachedTerminalContext,
  pathsReferToSameCwd,
  selectAttachedSessionsForWorkspace,
  stripAnsi,
  tailTerminalOutput,
} from '@/common/worktreeTerminal/attachedTerminalContext';

const attached = {
  id: 'pty-1',
  cwd: '/proj/worktree',
  agentAttached: true,
  available: true,
};

describe('attachedTerminalContext', () => {
  it('matches cwd across trailing separators and Windows case', () => {
    expect(pathsReferToSameCwd('/proj/worktree/', '/proj/worktree')).toBe(true);
    expect(pathsReferToSameCwd('C:\\Proj\\App', 'c:/proj/app', true)).toBe(true);
    expect(pathsReferToSameCwd('C:\\Proj\\App', 'c:/proj/app', false)).toBe(false);
    expect(pathsReferToSameCwd('/a', '/b')).toBe(false);
  });

  it('selects only attached, available sessions for the conversation workspace', () => {
    const selected = selectAttachedSessionsForWorkspace(
      [
        attached,
        { ...attached, id: 'pty-detached', agentAttached: false },
        { ...attached, id: 'pty-down', available: false },
        { ...attached, id: 'pty-other', cwd: '/other' },
      ],
      '/proj/worktree/'
    );
    expect(selected.map((s) => s.id)).toEqual(['pty-1']);
    expect(selectAttachedSessionsForWorkspace([attached], undefined)).toEqual([]);
  });

  it('strips ANSI and tails long output', () => {
    expect(stripAnsi('\u001B[32mhi\u001B[0m')).toBe('hi');
    const long = 'x'.repeat(ATTACHED_TERMINAL_CONTEXT_MAX_CHARS + 50);
    const tailed = tailTerminalOutput(long);
    expect(tailed.truncated).toBe(true);
    expect(tailed.text).toHaveLength(ATTACHED_TERMINAL_CONTEXT_MAX_CHARS);
    expect(tailed.text.endsWith('x'.repeat(10))).toBe(true);
  });

  it('formats a read-only snapshot block and is a no-op when empty', () => {
    expect(formatAttachedTerminalContext([])).toBe('');
    expect(appendAttachedTerminalContext('please look', [])).toBe('please look');
    const formatted = formatAttachedTerminalContext([{ cwd: '/proj', data: '864192' }]);
    expect(formatted).toContain('CSBU WorkMate attached terminal snapshot');
    expect(formatted).toContain('cwd: /proj');
    expect(formatted).toContain('864192');
    expect(appendAttachedTerminalContext('please look', [{ cwd: '/proj', data: '864192' }])).toBe(
      `please look${formatted}`
    );
  });

  it('appends snapshots from attached sessions and ignores detached or failed reads', async () => {
    const readForAgent = vi.fn(async (id: string) => {
      if (id === 'pty-1') return '\u001B[0mline one\n';
      throw new Error('Agent cannot read this terminal until you attach it');
    });
    const input = await collectAttachedTerminalContext('fix the build', '/proj/worktree', {
      list: async () => [
        attached,
        { id: 'pty-detached', cwd: '/proj/worktree', agentAttached: false, available: true },
      ],
      readForAgent,
    });
    expect(readForAgent).toHaveBeenCalledTimes(1);
    expect(input).toContain('fix the build');
    expect(input).toContain('line one');
    expect(input).toContain('CSBU WorkMate attached terminal snapshot');
  });

  it('leaves the original input when listing fails or nothing is attached', async () => {
    await expect(
      collectAttachedTerminalContext('hello', '/proj', {
        list: async () => {
          throw new Error('ipc down');
        },
        readForAgent: async () => 'nope',
      })
    ).resolves.toBe('hello');
    await expect(
      collectAttachedTerminalContext('hello', '/proj', {
        list: async () => [{ id: 'x', cwd: '/proj', agentAttached: false, available: true }],
        readForAgent: async () => 'secret',
      })
    ).resolves.toBe('hello');
  });
});
