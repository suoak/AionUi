/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { WorktreeCapabilities } from '@/common/types/worktree';
import useSWR from 'swr';
import { isWorktreeSupported } from './worktreeModel';

/** Probe Core once; a Core without the worktree API (404) reads as unsupported. */
const fetchCapabilities = async (): Promise<WorktreeCapabilities | null> => {
  try {
    return await ipcBridge.worktree.capabilities.invoke();
  } catch {
    return null;
  }
};

export type WorktreeAvailability = {
  /** Core ships the API and found a recent-enough git. */
  supported: boolean;
  /** The selected folder is a git checkout (only probed when supported). */
  isGitRepo: boolean;
  /** Show the Local / Worktree switch at all. */
  canUseWorktree: boolean;
};

/**
 * Whether Worktree mode can be offered for `dir` (design E3 §4.2: the switch
 * appears only for a git repository on a capable Core).
 */
export const useWorktreeAvailability = (dir: string): WorktreeAvailability => {
  const { data: caps } = useSWR('worktree.capabilities', fetchCapabilities, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const supported = isWorktreeSupported(caps);
  const { data: isGitRepo = false } = useSWR(
    supported && dir ? ['worktree.isGitWorkspace', dir] : null,
    ([, target]: [string, string]) => ipcBridge.worktree.isGitWorkspace.invoke({ dir: target }),
    { revalidateOnFocus: false }
  );
  return { supported, isGitRepo, canUseWorktree: supported && Boolean(dir) && isGitRepo };
};
