/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure helpers for the single-conversation Worktree mode (M7 E3-3). No React.
 * Core owns every git decision; these only shape requests and read results.
 */

import type {
  WorktreeBranchPolicy,
  WorktreeCapabilities,
  WorktreeChangedEvent,
  WorktreeError,
  WorktreeInfo,
  WorktreeProgressEvent,
} from '@/common/types/worktree';

/** Error codes the UI has a dedicated message for (`conversation.worktree.errors.*`). */
const KNOWN_ERROR_CODES = new Set([
  'GIT_NOT_AVAILABLE',
  'GIT_TOO_OLD',
  'NOT_A_REPOSITORY',
  'REF_NOT_FOUND',
  'BRANCH_EXISTS',
  'PATH_TOO_LONG',
  'WORKTREE_DIRTY',
  'WORKTREE_INVALID_STATE',
  'INTERRUPTED',
  'GIT_TIMEOUT',
  'REMOVE_FAILED',
]);

/** Whether `code` is a worktree error the UI explains itself. */
export const isKnownWorktreeErrorCode = (code: string | undefined | null): code is string =>
  Boolean(code && KNOWN_ERROR_CODES.has(code));

/** i18n key for a Core worktree error code; unknown codes fall back to a generic line. */
export const worktreeErrorKey = (code: string | undefined | null): string =>
  isKnownWorktreeErrorCode(code) ? `conversation.worktree.errors.${code}` : 'conversation.worktree.errors.UNKNOWN';

/** Worktree mode is offered only on a Core that ships the API and found a usable git. */
export const isWorktreeSupported = (caps: WorktreeCapabilities | null | undefined): boolean => caps?.available === true;

/**
 * Branch policy the delete dialog preselects: unmerged commits keep the branch
 * (design §2.1 step 5); otherwise `auto`, which Core deletes only when merged.
 */
export const defaultBranchPolicy = (info: Pick<WorktreeInfo, 'ahead'> | null | undefined): WorktreeBranchPolicy =>
  (info?.ahead ?? 0) > 0 ? 'keep' : 'auto';

/** Removed worktrees whose branch Core kept — the "review preserved branches" list. */
export const preservedBranches = (rows: WorktreeInfo[]): WorktreeInfo[] =>
  rows
    .filter((row) => row.status === 'removed' && row.branch_preserved)
    .toSorted((a, b) => (b.removed_at ?? b.updated_at) - (a.removed_at ?? a.updated_at));

/** Worktrees still on disk but no longer held by a conversation (deleted chat, failed create). */
export const detachedWorktrees = (rows: WorktreeInfo[]): WorktreeInfo[] =>
  rows.filter(
    (row) =>
      row.status === 'unbound' ||
      row.status === 'orphaned' ||
      row.status === 'failed' ||
      (row.status === 'ready' && !row.conversation_id)
  );

/** The bound worktree id a conversation carries in its server-owned `extra`. */
export const conversationWorktreeId = (extra: unknown): string | undefined => {
  if (!extra || typeof extra !== 'object') return undefined;
  const value = (extra as { worktree_id?: unknown }).worktree_id;
  return typeof value === 'string' && value.trim() ? value : undefined;
};

/** The repository name shown for a worktree (last path segment of the source repo). */
export const repoDisplayName = (path: string): string => path.split(/[\\/]/).findLast(Boolean) || path;

/** Thrown when the user cancels worktree preparation; not an error to report. */
export class WorktreePrepareCancelled extends Error {
  constructor() {
    super('worktree preparation cancelled');
    this.name = 'WorktreePrepareCancelled';
  }
}

/** Thrown when Core reports the worktree `failed`; carries the Core error. */
export class WorktreePrepareFailed extends Error {
  readonly worktree: WorktreeInfo;
  readonly code: string;
  constructor(worktree: WorktreeInfo) {
    super(worktree.error?.message || 'worktree creation failed');
    this.name = 'WorktreePrepareFailed';
    this.worktree = worktree;
    this.code = worktree.error?.code ?? 'UNKNOWN';
  }
}

export const isWorktreePrepareCancelled = (error: unknown): error is WorktreePrepareCancelled =>
  error instanceof WorktreePrepareCancelled;

export const isWorktreePrepareFailed = (error: unknown): error is WorktreePrepareFailed =>
  error instanceof WorktreePrepareFailed;

/** The subset of `ipcBridge.worktree` the wait loop needs (injectable for tests). */
export type WorktreeWaitApi = {
  get: (id: string) => Promise<WorktreeInfo>;
  onProgress: (cb: (event: WorktreeProgressEvent) => void) => () => void;
  onChanged: (cb: (event: WorktreeChangedEvent) => void) => () => void;
};

export type WaitForReadyOptions = {
  onProgress?: (event: WorktreeProgressEvent) => void;
  /** Poll interval; events make it fast, polling makes it robust to a dropped socket. */
  pollMs?: number;
  signal?: AbortSignal;
};

/**
 * Resolve with the worktree once Core reports `ready`; reject with
 * `WorktreePrepareCancelled` (user cancel / abort) or `WorktreePrepareFailed`.
 */
export const waitForWorktreeReady = (
  id: string,
  api: WorktreeWaitApi,
  options: WaitForReadyOptions = {}
): Promise<WorktreeInfo> =>
  new Promise<WorktreeInfo>((resolve, reject) => {
    let settled = false;
    let checking = false;
    let recheck = false;
    const cleanups: Array<() => void> = [];
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      for (const cleanup of cleanups) cleanup();
      fn();
    };

    const check = async () => {
      if (settled) return;
      if (checking) {
        recheck = true;
        return;
      }
      checking = true;
      try {
        const info = await api.get(id);
        if (info.status === 'ready' || info.status === 'unbound') {
          finish(() => resolve(info));
        } else if (info.status === 'failed') {
          finish(() =>
            reject(info.error?.code === 'CANCELLED' ? new WorktreePrepareCancelled() : new WorktreePrepareFailed(info))
          );
        } else if (info.status !== 'creating') {
          // removing / removed / orphaned while we waited: nothing to bind.
          const error: WorktreeError = { code: 'WORKTREE_INVALID_STATE', message: info.status };
          finish(() => reject(new WorktreePrepareFailed({ ...info, error })));
        }
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      } finally {
        checking = false;
        if (recheck && !settled) {
          recheck = false;
          void check();
        }
      }
    };

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new WorktreePrepareCancelled());
        return;
      }
      const onAbort = () => finish(() => reject(new WorktreePrepareCancelled()));
      options.signal.addEventListener('abort', onAbort, { once: true });
      cleanups.push(() => options.signal?.removeEventListener('abort', onAbort));
    }

    cleanups.push(
      api.onProgress((event) => {
        if (event.worktree_id === id && !settled) options.onProgress?.(event);
      })
    );
    cleanups.push(
      api.onChanged((event) => {
        if (event.worktree_id === id) void check();
      })
    );
    const timer = setInterval(() => void check(), options.pollMs ?? 1500);
    cleanups.push(() => clearInterval(timer));
    void check();
  });
