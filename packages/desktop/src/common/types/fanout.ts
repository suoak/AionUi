/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Wire types for Core fan-out groups (`/api/fanout-groups*`, M7 E3-4).
 * Field names follow the Core JSON exactly (snake_case).
 */

import type { WorktreeDiffStat, WorktreeError, WorktreeInfo } from './worktree';

export const FANOUT_MIN_SLOTS = 2;
export const FANOUT_MAX_SLOTS = 5;
export const FANOUT_DEFAULT_SLOTS = 3;
export const FANOUT_SLOT_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;

export type FanoutGroupStatus =
  | 'preparing'
  | 'running'
  | 'comparing'
  | 'adopted'
  | 'discarded'
  | 'cancelled'
  | 'failed'
  | (string & {});

export type FanoutSlotStatus =
  | 'preparing'
  | 'starting'
  | 'running'
  | 'finished'
  | 'failed'
  | 'cancelled'
  | 'adopted'
  | 'removed'
  | (string & {});

export type FanoutAdoptStrategy = 'branch_only' | 'squash' | 'no_ff' | 'cherry_pick';
export const FANOUT_ADOPT_STRATEGIES: FanoutAdoptStrategy[] = ['branch_only', 'squash', 'no_ff', 'cherry_pick'];

/** A model id, or (aionrs) a `{provider_id, model}` object. */
export type FanoutSlotModel = string | { provider_id: string; model: string };

/** One slot: an existing assistant with its own permission mode, MCP and skills. */
export type FanoutSlotInput = {
  assistant_id: string;
  model?: FanoutSlotModel;
};

export type CreateFanoutGroupInput = {
  repo_path: string;
  base_ref?: string;
  prompt: string;
  files?: unknown[];
  sessions?: unknown[];
  task_session_id?: string;
  max_parallel?: number;
  title?: string;
  slots: FanoutSlotInput[];
};

export type FanoutSlot = {
  slot: string;
  worktree_id: string;
  status: FanoutSlotStatus;
  worktree_status: string;
  assistant_id: string;
  model?: FanoutSlotModel | null;
  conversation_id?: string | null;
  branch: string;
  path: string;
  branch_preserved: boolean;
  error?: WorktreeError | null;
};

export type FanoutCleanupError = { worktree_id: string; message: string };

export type FanoutAdoptResult = {
  slot: string;
  strategy: FanoutAdoptStrategy;
  branch: string;
  branch_commit: string;
  snapshot_commit?: string | null;
  target_branch?: string | null;
  result_commit?: string | null;
  removed_worktrees: string[];
  preserved_branches: string[];
  cleanup_errors?: FanoutCleanupError[];
};

export type FanoutGroup = {
  id: string;
  status: FanoutGroupStatus;
  title: string;
  source_repo_path: string;
  base_ref: string;
  base_commit: string;
  prompt: string;
  max_parallel: number;
  task_session_id?: string | null;
  winner_slot?: string | null;
  adopt_result?: FanoutAdoptResult | null;
  slots: FanoutSlot[];
  created_at: number;
  updated_at: number;
};

export type FanoutCompareSlot = {
  slot: string;
  status: FanoutSlotStatus;
  worktree: WorktreeInfo;
  assistant_id: string;
  model?: FanoutSlotModel | null;
  conversation_id?: string | null;
  diff?: WorktreeDiffStat | null;
  summary?: string | null;
  usage?: unknown;
  tests?: unknown;
};

export type FanoutFileCell = { status: string; additions: number; deletions: number };

export type FanoutFileRow = { path: string; slots: Record<string, FanoutFileCell> };

export type FanoutCompare = {
  group: FanoutGroup;
  slots: FanoutCompareSlot[];
  files: FanoutFileRow[];
};

export type AdoptFanoutInput = {
  id: string;
  slot: string;
  strategy?: FanoutAdoptStrategy;
  target_branch?: string;
  snapshot_message?: string;
  cleanup?: { remove_others?: boolean; keep_branches?: boolean };
};

export type FanoutChangedEvent = {
  user_id?: string;
  group_id: string;
  status: FanoutGroupStatus;
  slot?: string | null;
  slot_status?: FanoutSlotStatus | null;
};
