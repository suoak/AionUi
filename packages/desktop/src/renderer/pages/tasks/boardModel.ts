/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TASK_BOARD_STATUSES,
  type TaskAssignee,
  type TaskBoardItem,
  type TaskBoardRejectionReason,
  type TaskBoardResponse,
  type TaskBoardStatus,
  type TaskComment,
  type TaskSession,
  type TaskSessionStatus,
} from '@/common/types/agent/taskSession';
import { isBackendHttpError } from '@/common/adapter/httpBridge';

/** Columns shown by default; `cancelled` is behind a toggle. */
export const VISIBLE_BOARD_COLUMNS: readonly TaskBoardStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
];

/**
 * D6-3 (adopted default): board column for a task session that has no
 * `board_status` yet, derived from its run status. Same mapping migration 072
 * applies to existing rows, so the board does not jump when the Core field lands.
 */
export const boardStatusFromRunStatus = (status: TaskSessionStatus): TaskBoardStatus => {
  switch (status) {
    case 'completed':
      return 'done';
    case 'running':
    case 'waiting_approval':
    case 'paused':
      return 'in_progress';
    case 'failed':
    case 'cancelled':
      return 'cancelled';
    default:
      return 'backlog';
  }
};

const isBoardStatus = (value: unknown): value is TaskBoardStatus =>
  typeof value === 'string' && (TASK_BOARD_STATUSES as readonly string[]).includes(value);

/** Prefer the Core-provided `board_status` (E6-2); fall back to the D6-3 mapping. */
export const boardStatusForTask = (task: TaskSession): TaskBoardStatus =>
  isBoardStatus(task.board_status) ? task.board_status : boardStatusFromRunStatus(task.status);

export type TaskRunBadge = 'running' | 'blocked' | 'paused' | 'failed';

/** Run-state badge on a card; `null` when the run state adds nothing to the column. */
export const runBadgeForTask = (task: Pick<TaskSession, 'status'>): TaskRunBadge | null => {
  switch (task.status) {
    case 'running':
      return 'running';
    case 'waiting_approval':
      return 'blocked';
    case 'paused':
      return 'paused';
    case 'failed':
      return 'failed';
    default:
      return null;
  }
};

export type BoardColumns = Record<TaskBoardStatus, TaskSession[]>;

/** Group into columns; within a column the most recently updated comes first. */
export const groupTasksByBoardStatus = (tasks: readonly TaskSession[]): BoardColumns => {
  const columns = Object.fromEntries(TASK_BOARD_STATUSES.map((s) => [s, [] as TaskSession[]])) as BoardColumns;
  for (const task of tasks) columns[boardStatusForTask(task)].push(task);
  for (const status of TASK_BOARD_STATUSES) columns[status].sort((a, b) => b.updated_at - a.updated_at);
  return columns;
};

// ---- Board API (Core E6-3) ----

export type BoardItemColumns = Record<TaskBoardStatus, TaskBoardItem[]>;

const emptyItemColumns = (): BoardItemColumns =>
  Object.fromEntries(TASK_BOARD_STATUSES.map((s) => [s, [] as TaskBoardItem[]])) as BoardItemColumns;

/** Within a column: `board_rank` ascending (lexicographic, `null` last), then most recently updated. */
export const compareBoardItems = (a: TaskBoardItem, b: TaskBoardItem): number => {
  if (a.board_rank !== b.board_rank) {
    if (a.board_rank === null) return 1;
    if (b.board_rank === null) return -1;
    return a.board_rank < b.board_rank ? -1 : 1;
  }
  return b.updated_at - a.updated_at;
};

/** Columns from `GET /api/task-sessions/board`, tolerating missing or unknown columns. */
export const columnsFromBoardResponse = (response: TaskBoardResponse | null | undefined): BoardItemColumns => {
  const columns = emptyItemColumns();
  for (const column of response?.columns ?? []) {
    if (!isBoardStatus(column.board_status)) continue;
    columns[column.board_status].push(...(column.items ?? []));
  }
  for (const status of TASK_BOARD_STATUSES) columns[status].sort(compareBoardItems);
  return columns;
};

/** Legacy cores (no board API): show task sessions as read-only cards via the D6-3 mapping. */
export const boardItemFromTaskSession = (task: TaskSession): TaskBoardItem => ({
  id: task.id,
  title: task.title,
  project_id: task.project_id ?? null,
  conversation_id: task.conversation_id ?? null,
  mode: task.mode,
  status: task.status,
  board_status: boardStatusForTask(task),
  assignee: null,
  priority: 0,
  labels: [],
  board_rank: null,
  external_ref: null,
  created_at: task.created_at,
  updated_at: task.updated_at,
});

export const columnsFromTaskSessions = (tasks: readonly TaskSession[]): BoardItemColumns => {
  const columns = emptyItemColumns();
  for (const task of tasks) {
    const item = boardItemFromTaskSession(task);
    columns[item.board_status].push(item);
  }
  for (const status of TASK_BOARD_STATUSES) columns[status].sort(compareBoardItems);
  return columns;
};

/**
 * Column moves a user may make by drag (PATCH board_status), mirroring Core
 * `board::check_transition`. Used only to disable drop targets; the server
 * stays authoritative (e.g. plan/goal items without an approved plan).
 */
const USER_MOVES: Record<TaskBoardStatus, readonly TaskBoardStatus[]> = {
  backlog: ['todo', 'cancelled'],
  todo: ['backlog', 'in_progress', 'cancelled'],
  in_progress: ['todo', 'in_review', 'cancelled'],
  in_review: ['cancelled'],
  done: [],
  cancelled: ['backlog'],
};

export const canUserMoveBoardItem = (from: TaskBoardStatus, to: TaskBoardStatus): boolean =>
  USER_MOVES[from].includes(to);

export const userMoveTargets = (from: TaskBoardStatus): readonly TaskBoardStatus[] => USER_MOVES[from];

/** Move an item between columns locally (optimistic update / rollback). */
export const moveItemInColumns = (
  columns: BoardItemColumns,
  itemId: string,
  to: TaskBoardStatus,
  replacement?: TaskBoardItem
): BoardItemColumns => {
  const next = emptyItemColumns();
  let moved: TaskBoardItem | undefined;
  for (const status of TASK_BOARD_STATUSES) {
    for (const item of columns[status]) {
      if (item.id === itemId) moved = item;
      else next[status].push(item);
    }
  }
  if (!moved) return columns;
  const placed = replacement ?? { ...moved, board_status: to };
  next[placed.board_status].push(placed);
  next[placed.board_status].sort(compareBoardItems);
  return next;
};

export const findBoardItem = (columns: BoardItemColumns, itemId: string | null): TaskBoardItem | null => {
  if (!itemId) return null;
  for (const status of TASK_BOARD_STATUSES) {
    const hit = columns[status].find((item) => item.id === itemId);
    if (hit) return hit;
  }
  return null;
};

const REJECTION_REASONS: readonly TaskBoardRejectionReason[] = [
  'review_required',
  'backlog_not_started',
  'plan_not_approved',
  'agent_review_gate',
  'not_in_review',
  'not_allowed',
];

/** `details.reason` of a 409 `board_transition_rejected`, else null. */
export const boardRejectionReason = (error: unknown): TaskBoardRejectionReason | null => {
  if (!isBackendHttpError(error) || error.code !== 'board_transition_rejected') return null;
  const reason = (error.details as { reason?: unknown } | undefined)?.reason;
  return typeof reason === 'string' && (REJECTION_REASONS as readonly string[]).includes(reason)
    ? (reason as TaskBoardRejectionReason)
    : 'not_allowed';
};

/** Older cores without the board API answer 404/405 on `GET /api/task-sessions/board`. */
export const isBoardApiUnavailable = (error: unknown): boolean =>
  isBackendHttpError(error) && (error.status === 404 || error.status === 405);

/** Comments can be edited by their author for 15 minutes (Core rule; server enforces). */
export const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

export const canEditComment = (comment: TaskComment, now: number): boolean =>
  comment.kind === 'comment' && comment.author_kind === 'user' && now - comment.created_at < COMMENT_EDIT_WINDOW_MS;

export type TimelineEvent =
  | { kind: 'comment'; text: string }
  | { kind: 'status_change'; from: string; to: string }
  | { kind: 'assignment'; assignee: TaskAssignee | null }
  | { kind: 'review_decision'; decision: string; comment: string | null }
  | { kind: 'unknown'; text: string };

/** Decode a timeline entry; event kinds carry a JSON body. */
export const parseTimelineEntry = (comment: TaskComment): TimelineEvent => {
  if (comment.kind === 'comment') return { kind: 'comment', text: comment.body };
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(comment.body);
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!body) return { kind: 'unknown', text: comment.body };
  switch (comment.kind) {
    case 'status_change':
      return { kind: 'status_change', from: String(body.from ?? ''), to: String(body.to ?? '') };
    case 'assignment': {
      const a = body.assignee as { kind?: unknown; id?: unknown } | null | undefined;
      return {
        kind: 'assignment',
        assignee:
          a && typeof a.kind === 'string' && typeof a.id === 'string'
            ? { kind: a.kind as TaskAssignee['kind'], id: a.id }
            : null,
      };
    }
    case 'review_decision':
      return {
        kind: 'review_decision',
        decision: String(body.decision ?? ''),
        comment: typeof body.comment === 'string' && body.comment ? body.comment : null,
      };
    default:
      return { kind: 'unknown', text: comment.body };
  }
};

/** i18n key (under `conversation.taskBoard.errors`) for a failed board mutation. */
export const boardErrorKey = (error: unknown): string => {
  const reason = boardRejectionReason(error);
  if (reason) return `conversation.taskBoard.errors.${reason}`;
  return 'conversation.taskBoard.errors.generic';
};
