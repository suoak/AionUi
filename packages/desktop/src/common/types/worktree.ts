/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Wire types for Core managed git worktrees (`/api/worktrees*`, M7 E3).
 * Field names follow the Core JSON exactly (snake_case).
 */

export const WORKTREE_STATUSES = ['creating', 'ready', 'failed', 'unbound', 'removing', 'removed', 'orphaned'] as const;
export type WorktreeStatus = (typeof WORKTREE_STATUSES)[number];

/** Known Core error codes; the set is open, so unknown codes stay plain strings. */
export type WorktreeErrorCode =
  | 'GIT_NOT_AVAILABLE'
  | 'GIT_TOO_OLD'
  | 'NOT_A_REPOSITORY'
  | 'REF_NOT_FOUND'
  | 'BRANCH_EXISTS'
  | 'PATH_TOO_LONG'
  | 'WORKTREE_DIRTY'
  | 'WORKTREE_INVALID_STATE'
  | 'CANCELLED'
  | 'INTERRUPTED'
  | 'GIT_TIMEOUT'
  | 'REMOVE_FAILED'
  | (string & {});

export type WorktreeError = {
  code: WorktreeErrorCode;
  message: string;
};

export type WorktreeInfo = {
  id: string;
  status: WorktreeStatus;
  phase?: string | null;
  error?: WorktreeError | null;
  source_repo_path: string;
  repo_common_dir: string;
  path: string;
  branch: string;
  base_ref: string;
  base_commit: string;
  fanout_group_id?: string | null;
  slot?: string | null;
  task_session_id?: string | null;
  conversation_id?: string | null;
  size_bytes?: number | null;
  branch_preserved: boolean;
  /** Only on `GET /api/worktrees/{id}`. */
  ahead?: number | null;
  behind?: number | null;
  created_at: number;
  updated_at: number;
  removed_at?: number | null;
};

export type WorktreeCapabilities = {
  available: boolean;
  version?: string | null;
  min_version: string;
  error?: WorktreeError | null;
};

export type CreateWorktreeInput = {
  repo_path: string;
  base_ref?: string;
  branch?: string;
  title?: string;
  task_session_id?: string;
};

export type ListWorktreesInput = {
  repo_path?: string;
  status?: WorktreeStatus;
  include_removed?: boolean;
};

/** `auto` deletes the branch only when it is merged; `keep` / `force` are explicit. */
export type WorktreeBranchPolicy = 'auto' | 'keep' | 'force';

export type RemoveWorktreeInput = {
  id: string;
  branch?: WorktreeBranchPolicy;
  force_dir?: boolean;
};

export type WorktreeDiffFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'typechange'
  | 'untracked'
  | 'unchanged'
  | (string & {});

export type WorktreeDiffFile = {
  path: string;
  old_path?: string | null;
  status: WorktreeDiffFileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
};

export type WorktreeDiffStat = {
  worktree_id: string;
  base_commit: string;
  files: WorktreeDiffFile[];
  files_changed: number;
  additions: number;
  deletions: number;
  truncated: boolean;
};

export type WorktreeFileDiff = {
  worktree_id: string;
  base_commit: string;
  path: string;
  status: WorktreeDiffFileStatus;
  binary: boolean;
  patch: string;
  truncated: boolean;
};

export type WorktreeProgressEvent = {
  worktree_id: string;
  phase: string;
  percent?: number | null;
  message: string;
};

export type WorktreeChangedEvent = {
  worktree_id: string;
  status: WorktreeStatus;
};
