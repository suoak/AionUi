/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import useSWR from 'swr';

import type { ScmRepository, ScmStatus } from '../scmModel';
import { scmReviewScopeId } from '../scmModel';
import type { PullRequestRepoOption } from './CreatePullRequestModal';
import { isDeliveryUnsupported } from './prDeliveryModel';

export const DELIVERY_SUPPORT_KEY = ['scmDeliverySupported'] as const;

/**
 * Whether Core has the delivery API, probed once with a cheap list call (it never
 * runs a CLI). `false` until a list call succeeded, so the PR entry points stay
 * hidden on an older Core (404 / 405) and while the backend is unreachable.
 */
export const useDeliverySupported = (): boolean => {
  const { data } = useSWR(
    DELIVERY_SUPPORT_KEY,
    async () => {
      try {
        await ipcBridge.scmDelivery.list.invoke({ limit: 1 });
        return true;
      } catch (err) {
        // Unsupported is final; anything else is retried by SWR on the next mount.
        if (isDeliveryUnsupported(err)) return false;
        throw err;
      }
    },
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  return data === true;
};

/** Dialog option for a repository, keyed by its pe scope id (no absolute path leaves Core). */
export const repoOption = (repo: ScmRepository, status?: ScmStatus): PullRequestRepoOption => ({
  repoPath: scmReviewScopeId(repo.root.pe_id, repo.root.relative_path),
  label: repo.pe_name ?? repo.label,
  branch: status?.head?.name ?? repo.head?.name,
});
