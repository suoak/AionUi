/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { CreateWorktreeInput, WorktreeInfo, WorktreeProgressEvent } from '@/common/types/worktree';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isWorktreePrepareCancelled, isWorktreePrepareFailed, waitForWorktreeReady } from './worktreeModel';

export type WorktreePreparationState =
  | { kind: 'idle' }
  | { kind: 'creating'; worktree: WorktreeInfo; progress?: WorktreeProgressEvent; cancelling: boolean }
  | { kind: 'failed'; worktree: WorktreeInfo; code: string; message: string };

export type WorktreePreparation = {
  state: WorktreePreparationState;
  /** Create (or retry a failed attempt on the same repo) and resolve once `ready`. */
  prepare: (input: CreateWorktreeInput) => Promise<WorktreeInfo>;
  cancel: () => Promise<void>;
  /** Drop a failed attempt: remove its record and return to idle. */
  discard: () => Promise<void>;
};

const waitApi = {
  get: (id: string) => ipcBridge.worktree.get.invoke({ id }),
  onProgress: (cb: (event: WorktreeProgressEvent) => void) => ipcBridge.worktree.progress.on(cb),
  onChanged: (cb: Parameters<typeof ipcBridge.worktree.changed.on>[0]) => ipcBridge.worktree.changed.on(cb),
};

/** Best-effort removal of an abandoned attempt; Core keeps a branch with commits. */
const removeQuietly = async (id: string) => {
  try {
    await ipcBridge.worktree.remove.invoke({ id, branch: 'auto' });
  } catch (error) {
    console.warn('[worktree] cleanup of abandoned attempt failed:', error);
  }
};

/**
 * Drives one worktree creation for the Guid send flow: progress from
 * `worktree.progress`, cancel while creating, retry / discard after failure.
 */
export const useWorktreePreparation = (): WorktreePreparation => {
  const [state, setState] = useState<WorktreePreparationState>({ kind: 'idle' });
  const stateRef = useRef(state);
  stateRef.current = state;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const prepare = useCallback(async (input: CreateWorktreeInput): Promise<WorktreeInfo> => {
    const previous = stateRef.current;
    const started =
      previous.kind === 'failed' && previous.worktree.source_repo_path === input.repo_path
        ? await ipcBridge.worktree.retry.invoke({ id: previous.worktree.id })
        : await ipcBridge.worktree.create.invoke(input);
    if (previous.kind === 'failed' && previous.worktree.id !== started.id) {
      void removeQuietly(previous.worktree.id);
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: 'creating', worktree: started, cancelling: false });
    try {
      const ready = await waitForWorktreeReady(started.id, waitApi, {
        signal: controller.signal,
        onProgress: (progress) =>
          setState((current) =>
            current.kind === 'creating' && current.worktree.id === started.id ? { ...current, progress } : current
          ),
      });
      setState({ kind: 'idle' });
      return ready;
    } catch (error) {
      if (isWorktreePrepareFailed(error)) {
        setState({ kind: 'failed', worktree: error.worktree, code: error.code, message: error.message });
      } else if (isWorktreePrepareCancelled(error)) {
        setState({ kind: 'idle' });
        void removeQuietly(started.id);
      } else {
        setState({ kind: 'idle' });
      }
      throw error;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(async () => {
    const current = stateRef.current;
    if (current.kind !== 'creating' || current.cancelling) return;
    setState({ ...current, cancelling: true });
    try {
      // Core rolls back the directory and branch; the wait loop then sees
      // `failed / CANCELLED` and settles as a cancel.
      await ipcBridge.worktree.cancel.invoke({ id: current.worktree.id });
    } catch (error) {
      // Already ready/failed by the time cancel landed: stop waiting locally.
      console.warn('[worktree] cancel failed, aborting locally:', error);
      abortRef.current?.abort();
    }
  }, []);

  const discard = useCallback(async () => {
    const current = stateRef.current;
    if (current.kind !== 'failed') return;
    setState({ kind: 'idle' });
    await removeQuietly(current.worktree.id);
  }, []);

  return { state, prepare, cancel, discard };
};
