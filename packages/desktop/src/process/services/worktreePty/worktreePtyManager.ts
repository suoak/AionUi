/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Worktree PTY host (node-pty, MIT). Optional native module — soft-fail when
 * missing. Agent reads are gated until the user attaches (E11).
 */

import { assertAgentMayReadTerminal } from '@/common/worktreeTerminal/agentAttachGate';
import { randomUUID } from 'node:crypto';

type PtyHandle = {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (info: { exitCode: number; signal?: number }) => void) => void;
  pid: number;
};

export type WorktreePtySession = {
  id: string;
  cwd: string;
  pid?: number;
  agentAttached: boolean;
  available: boolean;
  error?: string;
};

export type WorktreePtyDataEvent = { id: string; data: string };
export type WorktreePtyExitEvent = { id: string; exitCode: number; signal?: number };

type SessionState = {
  meta: WorktreePtySession;
  pty: PtyHandle | null;
  /** Ring buffer of recent output for optional agent attach (capped). */
  recentOutput: string;
};

const MAX_RECENT = 64_000;
const sessions = new Map<string, SessionState>();

type DataListener = (event: WorktreePtyDataEvent) => void;
type ExitListener = (event: WorktreePtyExitEvent) => void;

const dataListeners = new Set<DataListener>();
const exitListeners = new Set<ExitListener>();

export function onWorktreePtyData(listener: DataListener): () => void {
  dataListeners.add(listener);
  return () => dataListeners.delete(listener);
}

export function onWorktreePtyExit(listener: ExitListener): () => void {
  exitListeners.add(listener);
  return () => exitListeners.delete(listener);
}

function loadNodePty(): { spawn: (file: string, args: string[], opts: Record<string, unknown>) => PtyHandle } | null {
  try {
    // Optional native dependency — absent when rebuild skipped.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node-pty') as {
      spawn: (file: string, args: string[], opts: Record<string, unknown>) => PtyHandle;
    };
  } catch {
    return null;
  }
}

function defaultShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: process.env.COMSPEC || 'cmd.exe', args: [] };
  }
  const shell = process.env.SHELL || '/bin/bash';
  return { file: shell, args: ['-l'] };
}

export function listWorktreePtySessions(): WorktreePtySession[] {
  return [...sessions.values()].map((s) => ({ ...s.meta }));
}

export function getWorktreePtySession(id: string): WorktreePtySession | null {
  const s = sessions.get(id);
  return s ? { ...s.meta } : null;
}

export function createWorktreePtySession(params: { cwd: string; cols?: number; rows?: number }): WorktreePtySession {
  const id = randomUUID();
  const nodePty = loadNodePty();
  if (!nodePty) {
    const meta: WorktreePtySession = {
      id,
      cwd: params.cwd,
      agentAttached: false,
      available: false,
      error: 'node-pty is not available in this build (optional native module)',
    };
    sessions.set(id, { meta, pty: null, recentOutput: '' });
    return { ...meta };
  }

  const { file, args } = defaultShell();
  const cols = params.cols ?? 80;
  const rows = params.rows ?? 24;
  let pty: PtyHandle;
  try {
    pty = nodePty.spawn(file, args, {
      name: 'xterm-color',
      cols,
      rows,
      cwd: params.cwd,
      env: process.env,
    });
  } catch (error) {
    const meta: WorktreePtySession = {
      id,
      cwd: params.cwd,
      agentAttached: false,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
    sessions.set(id, { meta, pty: null, recentOutput: '' });
    return { ...meta };
  }

  const meta: WorktreePtySession = {
    id,
    cwd: params.cwd,
    pid: pty.pid,
    agentAttached: false,
    available: true,
  };
  const state: SessionState = { meta, pty, recentOutput: '' };
  sessions.set(id, state);

  pty.onData((data) => {
    state.recentOutput = (state.recentOutput + data).slice(-MAX_RECENT);
    for (const listener of dataListeners) listener({ id, data });
  });
  pty.onExit(({ exitCode, signal }) => {
    for (const listener of exitListeners) listener({ id, exitCode, signal });
    sessions.delete(id);
  });

  return { ...meta };
}

export function writeWorktreePty(id: string, data: string): void {
  const s = sessions.get(id);
  if (!s?.pty) throw new Error('PTY session not available');
  s.pty.write(data);
}

export function resizeWorktreePty(id: string, cols: number, rows: number): void {
  const s = sessions.get(id);
  if (!s?.pty) throw new Error('PTY session not available');
  s.pty.resize(cols, rows);
}

export function killWorktreePty(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  try {
    s.pty?.kill();
  } finally {
    sessions.delete(id);
  }
}

export function setWorktreePtyAgentAttached(id: string, attached: boolean): WorktreePtySession {
  const s = sessions.get(id);
  if (!s) throw new Error('PTY session not found');
  s.meta.agentAttached = attached;
  return { ...s.meta };
}

/**
 * Agent-facing read of recent PTY output. Blocked until the user attaches.
 */
export function readWorktreePtyForAgent(id: string): { data: string } {
  const s = sessions.get(id);
  if (!s) throw new Error('PTY session not found');
  const blocked = assertAgentMayReadTerminal(s.meta.agentAttached);
  if (blocked) throw new Error(blocked);
  return { data: s.recentOutput };
}
