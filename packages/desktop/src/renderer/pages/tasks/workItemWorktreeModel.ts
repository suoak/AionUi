/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { TaskBoardItem, TaskComment } from '@/common/types/agent/taskSession';
import type { WorktreeInfo, WorktreeStatus } from '@/common/types/worktree';
import { squadErrorKey } from '@/renderer/pages/agent-center/squad/squadModel';

/** Worktree states that still hold (or are about to hold) a usable checkout. */
const LIVE_STATUSES: ReadonlySet<WorktreeStatus> = new Set<WorktreeStatus>(['creating', 'ready', 'unbound']);
/** Gone for good; never shown on the card. */
const GONE_STATUSES: ReadonlySet<WorktreeStatus> = new Set<WorktreeStatus>(['removing', 'removed']);

const newerFirst = (a: WorktreeInfo, b: WorktreeInfo): number =>
  b.created_at - a.created_at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/**
 * M8 Q12: the shared worktree of each work item, keyed by work item id.
 * Core links it through `task_session_id` (no fan-out group). A live one wins
 * over a failed/orphaned one; within the same class the newest wins.
 */
export const workItemWorktrees = (list: readonly WorktreeInfo[] | null | undefined): Map<string, WorktreeInfo> => {
  const byItem = new Map<string, WorktreeInfo>();
  if (!Array.isArray(list)) return byItem;
  const candidates = list
    .filter(
      (wt) =>
        wt &&
        typeof wt.task_session_id === 'string' &&
        wt.task_session_id &&
        !wt.fanout_group_id &&
        !wt.removed_at &&
        !GONE_STATUSES.has(wt.status)
    )
    .toSorted((a, b) => {
      const liveA = LIVE_STATUSES.has(a.status) ? 0 : 1;
      const liveB = LIVE_STATUSES.has(b.status) ? 0 : 1;
      return liveA - liveB || newerFirst(a, b);
    });
  for (const wt of candidates) {
    const id = wt.task_session_id as string;
    if (!byItem.has(id)) byItem.set(id, wt);
  }
  return byItem;
};

/** Core starts a Squad for a work item only once it left backlog and while it is open. */
export const canStartSquadForItem = (item: TaskBoardItem): boolean =>
  item.assignee?.kind === 'squad' &&
  Boolean(item.assignee.id) &&
  (item.board_status === 'todo' || item.board_status === 'in_progress');

/** Work-item specific instantiate errors (M8 E7-6b / Q12). */
const START_ERRORS = new Set([
  'squad_work_item_not_found',
  'squad_work_item_not_assigned',
  'squad_backlog_not_started',
  'squad_worktree_source_invalid',
  'squad_worktree_failed',
]);

/** i18n key for a failed "start Squad for this work item"; other Squad codes reuse the Agent Center keys. */
export const squadStartErrorKey = (error: unknown): string => {
  if (isBackendHttpError(error)) {
    const prefix = /^([a-z][a-z0-9_]*)(?::|$)/.exec(error.backendMessage.trim())?.[1];
    const code = START_ERRORS.has(error.code) ? error.code : prefix && START_ERRORS.has(prefix) ? prefix : null;
    if (code) return `conversation.taskBoard.squadStart.errors.${code}`;
  }
  return squadErrorKey(error);
};

/** `reason` detail of a 400 `squad_worktree_source_invalid` / 500 `squad_worktree_failed`. */
export const squadStartErrorReason = (error: unknown): string | null => {
  if (!isBackendHttpError(error)) return null;
  const reason = (error.details as { reason?: unknown } | null | undefined)?.reason;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
};

/**
 * M8 E7-5: the Leader's per-round evaluation comment (`本轮评估：…`, written by
 * Core as an agent comment on the work item).
 */
export const isLeaderEvalComment = (comment: TaskComment): boolean =>
  comment.kind === 'comment' && comment.author_kind === 'agent' && /^\s*本轮评估[：:]/.test(comment.body);

/** M8 Q12: the system note Core writes when a closed work item keeps its worktree. */
export const isWorktreeKeptComment = (comment: TaskComment): boolean =>
  comment.author_kind === 'system' && comment.author_id === 'worktree';
