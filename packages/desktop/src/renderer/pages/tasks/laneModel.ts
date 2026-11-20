/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 3.0 U2: the four task lanes (To do · In progress · Needs you · Done, plus
 * Cancelled behind a toggle) projected over the board columns. Core ≥ 0.6
 * sends `lane` / `needs_you_reason` on every item; for older cores the same
 * rule is applied here (mirror of Core `board::derive_lane`), so the board
 * never jumps when the Core field lands.
 */

import {
  TASK_BOARD_STATUSES,
  type TaskBoardItem,
  type TaskBoardStatus,
  type TaskLane,
  type TaskNeedsYouReason,
} from '@/common/types/agent/taskSession';
import { compareBoardItems, type BoardItemColumns } from './boardModel';

/** Lanes shown by default, in display order. */
/** Lane order on the board: what needs you first (UI overhaul plan §D). */
export const VISIBLE_LANES: readonly TaskLane[] = ['needs_you', 'in_progress', 'todo', 'done'];

/** Lane and needs-you reason from the stored board status and run state. */
export const deriveLane = (
  boardStatus: TaskBoardStatus,
  runStatus: string
): { lane: TaskLane; reason: TaskNeedsYouReason | null } => {
  if (boardStatus === 'done') return { lane: 'done', reason: null };
  if (boardStatus === 'cancelled') return { lane: 'cancelled', reason: null };
  if (runStatus === 'waiting_approval') return { lane: 'needs_you', reason: 'plan_approval' };
  if (runStatus === 'failed') return { lane: 'needs_you', reason: 'failed' };
  if (runStatus === 'paused') return { lane: 'needs_you', reason: 'input' };
  if (boardStatus === 'in_review') return { lane: 'needs_you', reason: 'review' };
  if (boardStatus === 'in_progress') return { lane: 'in_progress', reason: null };
  if (runStatus === 'running') return { lane: 'in_progress', reason: null };
  return { lane: 'todo', reason: null };
};

/** Core's lane when present, else the derived one. */
export const laneForItem = (item: TaskBoardItem): TaskLane =>
  item.lane ?? deriveLane(item.board_status, item.status).lane;

export const needsYouReasonForItem = (item: TaskBoardItem): TaskNeedsYouReason | null => {
  if (laneForItem(item) !== 'needs_you') return null;
  return item.needs_you_reason ?? deriveLane(item.board_status, item.status).reason;
};

/** A Core with the 3.0 task flow (`start`, lanes) always sends `lane`. */
export const isTaskFlowItem = (item: TaskBoardItem): boolean => typeof item.lane === 'string';

export type LaneItems = Record<TaskLane, TaskBoardItem[]>;

/**
 * Project board columns onto lanes. Inside a lane, needs-you items keep the
 * column order (rank, then newest); a lane mixing columns sorts by rank too.
 */
export const lanesFromColumns = (columns: BoardItemColumns): LaneItems => {
  const lanes: LaneItems = { todo: [], in_progress: [], needs_you: [], done: [], cancelled: [] };
  for (const status of TASK_BOARD_STATUSES) {
    for (const item of columns[status] ?? []) lanes[laneForItem(item)].push(item);
  }
  for (const lane of Object.keys(lanes) as TaskLane[]) lanes[lane].sort(compareBoardItems);
  return lanes;
};

/** Sider badge: how many tasks wait on the user. */
export const needsYouCount = (columns: BoardItemColumns): number => lanesFromColumns(columns).needs_you.length;

/** What dropping a card on a lane does; `null` when the drop is not allowed. */
export type LaneDropAction = { kind: 'start' } | { kind: 'move'; to: TaskBoardStatus };

/**
 * Plan B §3: drag only To do ↔ In progress (start) and to Cancelled. Done is
 * reached through review only. On a task-flow Core, To do → In progress
 * starts the task; on older cores it is the old column move.
 */
export const laneDropAction = (item: TaskBoardItem, to: TaskLane): LaneDropAction | null => {
  const from = laneForItem(item);
  if (from === to) return null;
  if (from === 'todo' && to === 'in_progress') {
    if (isTaskFlowItem(item)) return { kind: 'start' };
    return item.board_status === 'todo' ? { kind: 'move', to: 'in_progress' } : null;
  }
  if (from === 'in_progress' && to === 'todo' && item.board_status === 'in_progress') {
    return { kind: 'move', to: 'todo' };
  }
  if (to === 'cancelled' && from !== 'done') return { kind: 'move', to: 'cancelled' };
  if (from === 'cancelled' && to === 'todo') return { kind: 'move', to: 'backlog' };
  return null;
};

/** Plan progress label input, or null when there is no plan to show. */
export const planProgress = (item: TaskBoardItem): { done: number; total: number; current: string | null } | null => {
  const plan = item.latest_plan;
  if (!plan || !Number.isFinite(plan.total) || plan.total <= 0) return null;
  return { done: Math.min(plan.done, plan.total), total: plan.total, current: plan.current?.trim() || null };
};
