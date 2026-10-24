import { describe, expect, it } from 'vitest';
import type { TaskSession, TaskSessionStatus } from '@/common/types/agent/taskSession';
import {
  boardStatusForTask,
  boardStatusFromRunStatus,
  groupTasksByBoardStatus,
  runBadgeForTask,
} from '@/renderer/pages/tasks/boardModel';

const task = (id: string, status: TaskSessionStatus, extra: Partial<TaskSession> = {}): TaskSession => ({
  id,
  title: id,
  mode: 'agent',
  objective: '',
  acceptance_criteria: [],
  status,
  agent_type: 'claude',
  created_at: 0,
  updated_at: 0,
  ...extra,
});

describe('boardModel', () => {
  it.each<[TaskSessionStatus, string]>([
    ['completed', 'done'],
    ['running', 'in_progress'],
    ['waiting_approval', 'in_progress'],
    ['paused', 'in_progress'],
    ['failed', 'cancelled'],
    ['cancelled', 'cancelled'],
    ['draft', 'backlog'],
    ['ready', 'backlog'],
  ])('maps run status %s to column %s (D6-3)', (status, column) => {
    expect(boardStatusFromRunStatus(status)).toBe(column);
  });

  it('prefers a valid board_status from Core over the run-status mapping', () => {
    expect(boardStatusForTask(task('a', 'completed', { board_status: 'in_review' }))).toBe('in_review');
    expect(boardStatusForTask(task('b', 'running', { board_status: 'bogus' as never }))).toBe('in_progress');
  });

  it('groups into every column, newest first', () => {
    const columns = groupTasksByBoardStatus([
      task('old', 'running', { updated_at: 1 }),
      task('new', 'paused', { updated_at: 5 }),
      task('d', 'draft'),
    ]);
    expect(columns.in_progress.map((t) => t.id)).toEqual(['new', 'old']);
    expect(columns.backlog.map((t) => t.id)).toEqual(['d']);
    expect(columns.todo).toEqual([]);
    expect(Object.keys(columns)).toHaveLength(6);
  });

  it('derives the run badge', () => {
    expect(runBadgeForTask(task('a', 'waiting_approval'))).toBe('blocked');
    expect(runBadgeForTask(task('a', 'running'))).toBe('running');
    expect(runBadgeForTask(task('a', 'completed'))).toBeNull();
  });
});
