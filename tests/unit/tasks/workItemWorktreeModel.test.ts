/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { TaskBoardItem, TaskComment } from '@/common/types/agent/taskSession';
import type { WorktreeInfo } from '@/common/types/worktree';
import {
  canStartSquadForItem,
  isLeaderEvalComment,
  isWorktreeKeptComment,
  squadStartErrorKey,
  squadStartErrorReason,
  workItemWorktrees,
} from '@/renderer/pages/tasks/workItemWorktreeModel';

const wt = (id: string, extra: Partial<WorktreeInfo> = {}): WorktreeInfo => ({
  id,
  status: 'ready',
  source_repo_path: '/repo',
  repo_common_dir: '/repo/.git',
  path: `/wt/${id}`,
  branch: `b/${id}`,
  base_ref: 'main',
  base_commit: 'abc',
  task_session_id: 'w1',
  fanout_group_id: null,
  branch_preserved: true,
  created_at: 1,
  updated_at: 1,
  ...extra,
});

const item = (extra: Partial<TaskBoardItem>): TaskBoardItem =>
  ({ id: 'w1', board_status: 'todo', assignee: { kind: 'squad', id: 'sq1' }, ...extra }) as TaskBoardItem;

const comment = (extra: Partial<TaskComment>): TaskComment => ({
  id: 'c1',
  task_session_id: 'w1',
  author_kind: 'agent',
  author_id: 'leader',
  kind: 'comment',
  body: '本轮评估：\n成员：a=working',
  created_at: 1,
  edited_at: null,
  ...extra,
});

const httpError = (status: number, code: string, details?: unknown, error = code) =>
  new BackendHttpError({ method: 'POST', path: '/api/squads/sq1/instantiate', status, body: { error, code, details } });

describe('workItemWorktrees', () => {
  it('keys shared worktrees by work item and skips fan-out, removed and unlinked rows', () => {
    const map = workItemWorktrees([
      wt('a'),
      wt('fan', { task_session_id: 'w2', fanout_group_id: 'g1' }),
      wt('gone', { task_session_id: 'w3', status: 'removed', removed_at: 5 }),
      wt('removing', { task_session_id: 'w4', status: 'removing' }),
      wt('loose', { task_session_id: null }),
    ]);
    expect([...map.keys()]).toEqual(['w1']);
    expect(map.get('w1')?.id).toBe('a');
  });

  it('prefers a live worktree, then the newest', () => {
    const map = workItemWorktrees([
      wt('old', { created_at: 1 }),
      wt('failed', { status: 'failed', created_at: 9 }),
      wt('new', { created_at: 5 }),
    ]);
    expect(map.get('w1')?.id).toBe('new');
    expect(workItemWorktrees([wt('orphan', { status: 'orphaned' })]).get('w1')?.id).toBe('orphan');
  });

  it('tolerates a missing list', () => {
    expect(workItemWorktrees(undefined).size).toBe(0);
  });
});

describe('canStartSquadForItem', () => {
  it('only allows open, non-backlog items assigned to a squad', () => {
    expect(canStartSquadForItem(item({}))).toBe(true);
    expect(canStartSquadForItem(item({ board_status: 'in_progress' }))).toBe(true);
    for (const board_status of ['backlog', 'in_review', 'done', 'cancelled'] as const) {
      expect(canStartSquadForItem(item({ board_status }))).toBe(false);
    }
    expect(canStartSquadForItem(item({ assignee: { kind: 'agent', id: 'a1' } }))).toBe(false);
    expect(canStartSquadForItem(item({ assignee: null }))).toBe(false);
  });
});

describe('squadStartErrorKey', () => {
  it('maps work-item instantiate errors to the board keys', () => {
    for (const [status, code] of [
      [404, 'squad_work_item_not_found'],
      [409, 'squad_work_item_not_assigned'],
      [409, 'squad_backlog_not_started'],
      [400, 'squad_worktree_source_invalid'],
      [500, 'squad_worktree_failed'],
    ] as const) {
      expect(squadStartErrorKey(httpError(status, code))).toBe(`conversation.taskBoard.squadStart.errors.${code}`);
    }
  });

  it('reads the code from the message prefix and falls back to the Squad keys', () => {
    expect(squadStartErrorKey(httpError(500, 'internal', undefined, 'squad_worktree_failed: git died'))).toBe(
      'conversation.taskBoard.squadStart.errors.squad_worktree_failed'
    );
    expect(squadStartErrorKey(httpError(503, 'squad_instantiate_unavailable'))).toBe(
      'agent.agentCenter.squad.errors.squad_instantiate_unavailable'
    );
    expect(squadStartErrorKey(new Error('boom'))).toBe('agent.agentCenter.squad.errors.generic');
  });

  it('exposes the worktree failure reason', () => {
    expect(squadStartErrorReason(httpError(400, 'squad_worktree_source_invalid', { reason: ' not a repo ' }))).toBe(
      'not a repo'
    );
    expect(squadStartErrorReason(httpError(409, 'squad_backlog_not_started', { board_status: 'backlog' }))).toBeNull();
    expect(squadStartErrorReason('x')).toBeNull();
  });
});

describe('timeline comment kinds', () => {
  it('recognizes Leader round evaluations', () => {
    expect(isLeaderEvalComment(comment({}))).toBe(true);
    expect(isLeaderEvalComment(comment({ body: '本轮评估:\nx' }))).toBe(true);
    expect(isLeaderEvalComment(comment({ author_kind: 'user' }))).toBe(false);
    expect(isLeaderEvalComment(comment({ kind: 'status_change' }))).toBe(false);
    expect(isLeaderEvalComment(comment({ body: 'done' }))).toBe(false);
  });

  it('recognizes the kept-worktree system note', () => {
    expect(isWorktreeKeptComment(comment({ author_kind: 'system', author_id: 'worktree' }))).toBe(true);
    expect(isWorktreeKeptComment(comment({ author_kind: 'system', author_id: 'board' }))).toBe(false);
  });
});
