/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TASK_BOARD_STATUSES,
  type TaskBoardStatus,
  type TaskSession,
  type TaskSessionStatus,
} from '@/common/types/agent/taskSession';

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
export const runBadgeForTask = (task: TaskSession): TaskRunBadge | null => {
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
