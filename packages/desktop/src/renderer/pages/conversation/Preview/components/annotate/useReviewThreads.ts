/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { CreateReviewThreadInput, ReviewThread } from '@/common/types/agent/taskSession';
import { useCallback } from 'react';
import useSWR from 'swr';

/** Which annotations a diff shows and where new ones go (Core review scope). */
export type ReviewScope = {
  scope_kind: CreateReviewThreadInput['scope_kind'];
  scope_id: string;
  file_path: string;
  /** Diff new-side base (`WORKTREE` / `INDEX` / commit); omitted = Core default. */
  base?: string;
  conversation_id?: string;
  task_session_id?: string;
  run_id?: string;
};

/**
 * Whether an error means this Core has no review-thread API at all (an older
 * Core such as 0.2.20 answers its generic 404 for the unknown route). Annotation
 * is then hidden and the diff stays a plain read-only diff.
 */
export const isReviewUnsupported = (error: unknown): boolean =>
  isBackendHttpError(error) &&
  (error.status === 404 || error.status === 405) &&
  error.code !== 'REVIEW_THREAD_NOT_FOUND';

const MAX_RETRIES = 3;

export const reviewThreadsKey = (scope: ReviewScope) =>
  ['reviewThreads', scope.scope_kind, scope.scope_id, scope.file_path] as const;

/**
 * Review threads of one file in one scope. Core re-anchors on every list, so a
 * refetch after the file changes moves the threads (or marks them outdated).
 */
export const useReviewThreads = (scope: ReviewScope | undefined) => {
  const { data, error, isLoading, mutate } = useSWR(
    scope ? reviewThreadsKey(scope) : null,
    () =>
      ipcBridge.review.list.invoke({
        scope_kind: scope!.scope_kind,
        scope_id: scope!.scope_id,
        file_path: scope!.file_path,
      }),
    {
      // An unsupported Core will not grow the route by retrying.
      onErrorRetry: (err, _key, _config, revalidate, { retryCount }) => {
        if (isReviewUnsupported(err) || retryCount >= MAX_RETRIES) return;
        setTimeout(() => void revalidate({ retryCount }), 2000 * 2 ** retryCount);
      },
    }
  );
  const unsupported = isReviewUnsupported(error);

  const replace = useCallback(
    (thread: ReviewThread) =>
      mutate((current) => {
        const list = current ?? [];
        return list.some((item) => item.id === thread.id)
          ? list.map((item) => (item.id === thread.id ? thread : item))
          : [...list, thread];
      }, false),
    [mutate]
  );

  const create = useCallback(
    async (input: Omit<CreateReviewThreadInput, keyof ReviewScope | 'scope_kind' | 'scope_id' | 'file_path'>) => {
      if (!scope) return undefined;
      const { base: _base, ...target } = scope;
      const thread = await ipcBridge.review.create.invoke({ ...target, ...input });
      await replace(thread);
      return thread;
    },
    [scope, replace]
  );

  const run = useCallback(
    async (action: () => Promise<ReviewThread>) => {
      const thread = await action();
      await replace(thread);
      return thread;
    },
    [replace]
  );

  const resolve = useCallback((id: string) => run(() => ipcBridge.review.resolve.invoke({ id })), [run]);
  const reopen = useCallback((id: string) => run(() => ipcBridge.review.reopen.invoke({ id })), [run]);
  const reply = useCallback(
    (id: string, body: string) => run(() => ipcBridge.review.addComment.invoke({ id, body })),
    [run]
  );
  const editBody = useCallback(
    (id: string, body: string) => run(() => ipcBridge.review.update.invoke({ id, body })),
    [run]
  );
  const remove = useCallback(
    async (id: string) => {
      await ipcBridge.review.remove.invoke({ id });
      await mutate((current) => (current ?? []).filter((item) => item.id !== id), false);
    },
    [mutate]
  );

  return {
    threads: Array.isArray(data) ? data : [],
    /** The list loaded, so this Core supports annotations for the scope. */
    ready: Array.isArray(data),
    unsupported,
    error: unsupported ? undefined : error,
    isLoading,
    refresh: () => mutate(),
    create,
    resolve,
    reopen,
    reply,
    editBody,
    remove,
  };
};
