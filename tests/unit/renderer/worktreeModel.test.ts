/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorktreeChangedEvent, WorktreeInfo, WorktreeProgressEvent } from '@/common/types/worktree';
import {
  WorktreePrepareCancelled,
  WorktreePrepareFailed,
  conversationWorktreeId,
  defaultBranchPolicy,
  detachedWorktrees,
  isKnownWorktreeErrorCode,
  isWorktreeSupported,
  preservedBranches,
  repoDisplayName,
  waitForWorktreeReady,
  worktreeErrorKey,
  type WorktreeWaitApi,
} from '@/renderer/pages/conversation/fanout/worktreeModel';

const info = (over: Partial<WorktreeInfo>): WorktreeInfo =>
  ({
    id: 'wt-1',
    status: 'creating',
    source_repo_path: '/src/repo',
    path: '/wt/repo-1',
    branch: 'wm/wt-1',
    created_at: 1,
    updated_at: 1,
    ...over,
  }) as WorktreeInfo;

describe('worktreeModel helpers', () => {
  it('maps known error codes to their own key and the rest to UNKNOWN', () => {
    expect(worktreeErrorKey('BRANCH_EXISTS')).toBe('conversation.worktree.errors.BRANCH_EXISTS');
    expect(worktreeErrorKey('SOMETHING_NEW')).toBe('conversation.worktree.errors.UNKNOWN');
    expect(worktreeErrorKey(undefined)).toBe('conversation.worktree.errors.UNKNOWN');
    expect(isKnownWorktreeErrorCode('REF_NOT_FOUND')).toBe(true);
    expect(isKnownWorktreeErrorCode(null)).toBe(false);
  });

  it('reads support and the default branch policy', () => {
    expect(isWorktreeSupported({ available: true } as never)).toBe(true);
    expect(isWorktreeSupported({ available: false } as never)).toBe(false);
    expect(isWorktreeSupported(null)).toBe(false);
    expect(defaultBranchPolicy({ ahead: 2 })).toBe('keep');
    expect(defaultBranchPolicy({ ahead: 0 })).toBe('auto');
    expect(defaultBranchPolicy(null)).toBe('auto');
  });

  it('splits detached worktrees from preserved branches', () => {
    const rows = [
      info({ id: 'a', status: 'ready', conversation_id: 'c1' }),
      info({ id: 'b', status: 'ready' }),
      info({ id: 'c', status: 'unbound' }),
      info({ id: 'd', status: 'failed' }),
      info({ id: 'e', status: 'removed', branch_preserved: true, removed_at: 5 }),
      info({ id: 'f', status: 'removed', branch_preserved: false }),
      info({ id: 'g', status: 'removed', branch_preserved: true, removed_at: 9 }),
    ];
    expect(detachedWorktrees(rows).map((r) => r.id)).toEqual(['b', 'c', 'd']);
    expect(preservedBranches(rows).map((r) => r.id)).toEqual(['g', 'e']);
  });

  it('reads the bound worktree id from conversation extra', () => {
    expect(conversationWorktreeId({ worktree_id: 'wt-9' })).toBe('wt-9');
    expect(conversationWorktreeId({ worktree_id: '  ' })).toBeUndefined();
    expect(conversationWorktreeId(null)).toBeUndefined();
    expect(conversationWorktreeId({ worktree_id: 3 })).toBeUndefined();
  });

  it('shows the last path segment as the repo name', () => {
    expect(repoDisplayName('/home/u/code/app/')).toBe('app');
    expect(repoDisplayName('C:\\work\\repo')).toBe('repo');
  });
});

describe('waitForWorktreeReady', () => {
  let progressListener: ((e: WorktreeProgressEvent) => void) | undefined;
  let changedListener: ((e: WorktreeChangedEvent) => void) | undefined;
  const get = vi.fn<(id: string) => Promise<WorktreeInfo>>();
  const api: WorktreeWaitApi = {
    get,
    onProgress: (fn) => {
      progressListener = fn;
      return () => {
        progressListener = undefined;
      };
    },
    onChanged: (fn) => {
      changedListener = fn;
      return () => {
        changedListener = undefined;
      };
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    get.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves once Core reports ready and forwards progress for this id only', async () => {
    get.mockResolvedValueOnce(info({ status: 'creating' })).mockResolvedValue(info({ status: 'ready' }));
    const onProgress = vi.fn();
    const promise = waitForWorktreeReady('wt-1', api, { onProgress, pollMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    progressListener?.({ worktree_id: 'wt-1', phase: 'checkout' } as WorktreeProgressEvent);
    progressListener?.({ worktree_id: 'other', phase: 'checkout' } as WorktreeProgressEvent);
    changedListener?.({ worktree_id: 'wt-1' } as WorktreeChangedEvent);
    await expect(promise).resolves.toMatchObject({ status: 'ready' });
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(progressListener).toBeUndefined();
    expect(changedListener).toBeUndefined();
  });

  it('polls when no event arrives', async () => {
    get.mockResolvedValueOnce(info({ status: 'creating' })).mockResolvedValue(info({ status: 'unbound' }));
    const promise = waitForWorktreeReady('wt-1', api, { pollMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({ status: 'unbound' });
  });

  it('rejects with Cancelled for a CANCELLED failure and Failed otherwise', async () => {
    get.mockResolvedValue(info({ status: 'failed', error: { code: 'CANCELLED', message: 'x' } }));
    await expect(waitForWorktreeReady('wt-1', api)).rejects.toBeInstanceOf(WorktreePrepareCancelled);

    get.mockResolvedValue(info({ status: 'failed', error: { code: 'BRANCH_EXISTS', message: 'x' } }));
    await expect(waitForWorktreeReady('wt-1', api)).rejects.toBeInstanceOf(WorktreePrepareFailed);
  });

  it('rejects with WORKTREE_INVALID_STATE when the worktree is removed while waiting', async () => {
    get.mockResolvedValue(info({ status: 'removing' }));
    const error = await waitForWorktreeReady('wt-1', api).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorktreePrepareFailed);
    expect((error as WorktreePrepareFailed).code).toBe('WORKTREE_INVALID_STATE');
  });

  it('rejects with Cancelled when the signal aborts', async () => {
    get.mockResolvedValue(info({ status: 'creating' }));
    const controller = new AbortController();
    const promise = waitForWorktreeReady('wt-1', api, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(WorktreePrepareCancelled);
    expect(changedListener).toBeUndefined();
  });
});
