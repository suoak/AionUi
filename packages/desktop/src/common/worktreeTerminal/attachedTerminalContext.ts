/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * When the user attaches the worktree terminal, include a recent snapshot of
 * its output in the next sent message so the agent can read it. Detached
 * sessions are never included. Brand: CSBU WorkMate.
 */

export type AttachedTerminalSession = {
  id: string;
  cwd: string;
  agentAttached: boolean;
  available?: boolean;
};

export type AttachedTerminalSnapshot = {
  cwd: string;
  data: string;
};

export type AttachedTerminalReader = {
  list: () => Promise<readonly AttachedTerminalSession[]>;
  readForAgent: (id: string) => Promise<string>;
  /** Windows workspaces compare cwd case-insensitively. */
  caseInsensitiveCwd?: boolean;
};

/** Max characters of terminal output included per session (tail). */
export const ATTACHED_TERMINAL_CONTEXT_MAX_CHARS = 8_000;

const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}(?:[@-Z\\-_]|\\[[0-?]*[ -/]*[@-~])`, 'g');

export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, '');
}

export function normalizeCwd(path: string, caseInsensitive = false): string {
  let value = path
    .trim()
    .replace(/[\\/]+$/, '')
    .replace(/\\/g, '/');
  if (caseInsensitive) value = value.toLowerCase();
  return value;
}

export function pathsReferToSameCwd(left: string, right: string, caseInsensitive = false): boolean {
  return normalizeCwd(left, caseInsensitive) === normalizeCwd(right, caseInsensitive);
}

export function selectAttachedSessionsForWorkspace(
  sessions: readonly AttachedTerminalSession[],
  workspacePath: string | undefined,
  caseInsensitive = false
): AttachedTerminalSession[] {
  if (!workspacePath?.trim()) return [];
  return sessions.filter(
    (session) =>
      session.agentAttached &&
      session.available !== false &&
      pathsReferToSameCwd(session.cwd, workspacePath, caseInsensitive)
  );
}

export function tailTerminalOutput(
  data: string,
  maxChars = ATTACHED_TERMINAL_CONTEXT_MAX_CHARS
): { text: string; truncated: boolean } {
  const text = stripAnsi(data).replace(/^\s+/, '');
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(text.length - maxChars), truncated: true };
}

export function formatAttachedTerminalContext(snapshots: readonly AttachedTerminalSnapshot[]): string {
  if (snapshots.length === 0) return '';
  const blocks = snapshots.map((snapshot) => {
    const { text, truncated } = tailTerminalOutput(snapshot.data);
    const note = truncated ? ' (earlier output truncated)\n' : '\n';
    return `cwd: ${snapshot.cwd}${note}\`\`\`text\n${text}\n\`\`\``;
  });
  return [
    '',
    '---',
    'CSBU WorkMate attached terminal snapshot (read-only; the user clicked Attach agent). The agent may read this output but must not assume it can type into the terminal.',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}

export function appendAttachedTerminalContext(input: string, snapshots: readonly AttachedTerminalSnapshot[]): string {
  const block = formatAttachedTerminalContext(snapshots);
  return block ? `${input}${block}` : input;
}

/**
 * List attached terminals for this workspace, read their output through the
 * agent gate, and append a snapshot to the message. Fail-soft: a listing or
 * read error leaves the original input unchanged (or omits that session).
 */
export async function collectAttachedTerminalContext(
  input: string,
  workspacePath: string | undefined,
  reader: AttachedTerminalReader
): Promise<string> {
  if (!workspacePath?.trim()) return input;
  let sessions: readonly AttachedTerminalSession[];
  try {
    sessions = await reader.list();
  } catch {
    return input;
  }
  const selected = selectAttachedSessionsForWorkspace(sessions, workspacePath, reader.caseInsensitiveCwd);
  if (selected.length === 0) return input;

  const results = await Promise.all(
    selected.map(async (session) => {
      try {
        const data = await reader.readForAgent(session.id);
        return data.trim() ? { cwd: session.cwd, data } : null;
      } catch {
        // The gate or a dead session must not block send.
        return null;
      }
    })
  );
  return appendAttachedTerminalContext(
    input,
    results.filter((snapshot): snapshot is AttachedTerminalSnapshot => snapshot != null)
  );
}
