/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TaskBoardItem, TaskBoardStatus } from '@/common/types/agent/taskSession';
import { columnsFromBoardResponse } from '@/renderer/pages/tasks/boardModel';
import {
  deriveLane,
  isTaskFlowItem,
  laneDropAction,
  laneForItem,
  lanesFromColumns,
  needsYouCount,
  needsYouReasonForItem,
  planProgress,
} from '@/renderer/pages/tasks/laneModel';

const item = (over: Partial<TaskBoardItem> = {}): TaskBoardItem => ({
  id: 't1',
  title: 'Task',
  project_id: null,
  conversation_id: null,
  mode: 'agent',
  status: 'draft',
  board_status: 'todo',
  assignee: null,
  priority: 0,
  labels: [],
  board_rank: null,
  external_ref: null,
  created_at: 1,
  updated_at: 1,
  ...over,
});

describe('deriveLane (mirror of Core board::derive_lane)', () => {
  const cases: [TaskBoardStatus, string, string, string | null][] = [
    ['done', 'failed', 'done', null],
    ['cancelled', 'running', 'cancelled', null],
    ['in_progress', 'waiting_approval', 'needs_you', 'plan_approval'],
    ['todo', 'failed', 'needs_you', 'failed'],
    ['in_progress', 'paused', 'needs_you', 'input'],
    ['in_review', 'completed', 'needs_you', 'review'],
    ['in_progress', 'running', 'in_progress', null],
    ['in_progress', 'draft', 'in_progress', null],
    ['backlog', 'running', 'in_progress', null],
    ['backlog', 'draft', 'todo', null],
    ['todo', 'ready', 'todo', null],
  ];
  it.each(cases)('%s + %s → %s (%s)', (board, run, lane, reason) => {
    expect(deriveLane(board, run)).toEqual({ lane, reason });
  });
});

describe('lane projection', () => {
  it('prefers the Core lane and reason, and derives them for older cores', () => {
    const core = item({ lane: 'needs_you', needs_you_reason: 'merge_conflict', board_status: 'in_progress' });
    expect(laneForItem(core)).toBe('needs_you');
    expect(needsYouReasonForItem(core)).toBe('merge_conflict');
    expect(isTaskFlowItem(core)).toBe(true);

    const legacy = item({ board_status: 'in_review' });
    expect(laneForItem(legacy)).toBe('needs_you');
    expect(needsYouReasonForItem(legacy)).toBe('review');
    expect(isTaskFlowItem(legacy)).toBe(false);
  });

  it('groups board columns into lanes and counts needs-you', () => {
    const columns = columnsFromBoardResponse({
      columns: [
        { board_status: 'backlog', items: [item({ id: 'a', board_status: 'backlog' })] },
        { board_status: 'todo', items: [item({ id: 'b' })] },
        {
          board_status: 'in_progress',
          items: [
            item({ id: 'c', board_status: 'in_progress', status: 'running' }),
            item({ id: 'd', board_status: 'in_progress', status: 'failed' }),
          ],
        },
        { board_status: 'in_review', items: [item({ id: 'e', board_status: 'in_review' })] },
        { board_status: 'done', items: [item({ id: 'f', board_status: 'done' })] },
        { board_status: 'cancelled', items: [item({ id: 'g', board_status: 'cancelled' })] },
      ],
    });
    const lanes = lanesFromColumns(columns);
    expect(lanes.todo.map((i) => i.id).toSorted()).toEqual(['a', 'b']);
    expect(lanes.in_progress.map((i) => i.id)).toEqual(['c']);
    expect(lanes.needs_you.map((i) => i.id).toSorted()).toEqual(['d', 'e']);
    expect(lanes.done.map((i) => i.id)).toEqual(['f']);
    expect(lanes.cancelled.map((i) => i.id)).toEqual(['g']);
    expect(needsYouCount(columns)).toBe(2);
  });
});

describe('laneDropAction (plan B §3: only To do ↔ In progress and Cancel)', () => {
  it('starts a task-flow item dropped from To do on In progress', () => {
    expect(laneDropAction(item({ lane: 'todo', board_status: 'backlog' }), 'in_progress')).toEqual({ kind: 'start' });
  });

  it('falls back to the old column move on older cores', () => {
    expect(laneDropAction(item({ board_status: 'todo' }), 'in_progress')).toEqual({ kind: 'move', to: 'in_progress' });
    expect(laneDropAction(item({ board_status: 'backlog' }), 'in_progress')).toBeNull();
  });

  it('never reaches Done or Needs you by drag', () => {
    expect(laneDropAction(item({ board_status: 'in_progress', status: 'running' }), 'done')).toBeNull();
    expect(laneDropAction(item(), 'needs_you')).toBeNull();
    expect(laneDropAction(item({ board_status: 'done' }), 'cancelled')).toBeNull();
  });

  it('moves back to To do, cancels, and restores from Cancelled', () => {
    expect(laneDropAction(item({ board_status: 'in_progress', status: 'running' }), 'todo')).toEqual({
      kind: 'move',
      to: 'todo',
    });
    expect(laneDropAction(item({ board_status: 'in_review' }), 'cancelled')).toEqual({ kind: 'move', to: 'cancelled' });
    expect(laneDropAction(item({ board_status: 'cancelled' }), 'todo')).toEqual({ kind: 'move', to: 'backlog' });
  });
});

describe('planProgress', () => {
  it('clamps and trims, and hides empty plans', () => {
    expect(planProgress(item({ latest_plan: { done: 3, total: 7, current: ' Write tests ' } }))).toEqual({
      done: 3,
      total: 7,
      current: 'Write tests',
    });
    expect(planProgress(item({ latest_plan: { done: 9, total: 2 } }))).toEqual({ done: 2, total: 2, current: null });
    expect(planProgress(item({ latest_plan: { done: 0, total: 0 } }))).toBeNull();
    expect(planProgress(item())).toBeNull();
  });
});
