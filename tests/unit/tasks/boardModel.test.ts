import { describe, expect, it } from 'vitest';
import type {
  TaskBoardItem,
  TaskBoardStatus,
  TaskComment,
  TaskSession,
  TaskSessionStatus,
} from '@/common/types/agent/taskSession';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import {
  applyBoardItem,
  boardErrorKey,
  boardItemFromTaskSession,
  boardRejectionReason,
  BOARD_TIMELINE_TRACE_CAP,
  canEditComment,
  canUserMoveBoardItem,
  columnsFromBoardResponse,
  isBoardApiUnavailable,
  isBoardItemStale,
  mergeBoardTimeline,
  moveItemInColumns,
  upsertComment,
  parseTimelineEntry,
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

const boardItem = (id: string, board_status: TaskBoardStatus, extra: Partial<TaskBoardItem> = {}): TaskBoardItem => ({
  id,
  title: id,
  project_id: null,
  conversation_id: null,
  mode: 'agent',
  status: 'draft',
  board_status,
  assignee: null,
  priority: 0,
  labels: [],
  board_rank: null,
  external_ref: null,
  created_at: 0,
  updated_at: 0,
  ...extra,
});

const entry = (kind: TaskComment['kind'], body: string, extra: Partial<TaskComment> = {}): TaskComment => ({
  id: 'c',
  task_session_id: 't',
  author_kind: 'user',
  author_id: 'me',
  kind,
  body,
  created_at: 0,
  edited_at: null,
  ...extra,
});

const httpError = (status: number, body: unknown) =>
  new BackendHttpError({ method: 'PATCH', path: '/x', status, body });

describe('boardModel board API helpers', () => {
  it('mirrors the Core user transition table', () => {
    const allowed: [TaskBoardStatus, TaskBoardStatus][] = [
      ['backlog', 'todo'],
      ['backlog', 'cancelled'],
      ['todo', 'backlog'],
      ['todo', 'in_progress'],
      ['todo', 'cancelled'],
      ['in_progress', 'todo'],
      ['in_progress', 'in_review'],
      ['in_progress', 'cancelled'],
      ['in_review', 'cancelled'],
      ['cancelled', 'backlog'],
    ];
    const all: TaskBoardStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'];
    for (const from of all) {
      for (const to of all) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(canUserMoveBoardItem(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it('orders a column by board_rank with null last, then by recency', () => {
    const columns = columnsFromBoardResponse({
      columns: [
        {
          board_status: 'todo',
          items: [
            boardItem('n1', 'todo', { updated_at: 1 }),
            boardItem('b', 'todo', { board_rank: 'b' }),
            boardItem('n2', 'todo', { updated_at: 2 }),
            boardItem('a', 'todo', { board_rank: 'a' }),
          ],
        },
      ],
    });
    expect(columns.todo.map((i) => i.id)).toEqual(['a', 'b', 'n2', 'n1']);
    expect(columns.backlog).toEqual([]);
    expect(columnsFromBoardResponse(null).done).toEqual([]);
  });

  it('moves items between columns and accepts the server copy', () => {
    const columns = columnsFromBoardResponse({ columns: [{ board_status: 'todo', items: [boardItem('t', 'todo')] }] });
    const moved = moveItemInColumns(columns, 't', 'in_progress');
    expect(moved.todo).toEqual([]);
    expect(moved.in_progress[0]).toMatchObject({ id: 't', board_status: 'in_progress' });
    const server = moveItemInColumns(moved, 't', 'todo', boardItem('t', 'in_review', { priority: 2 }));
    expect(server.in_review[0]).toMatchObject({ id: 't', priority: 2 });
    expect(moveItemInColumns(columns, 'missing', 'done')).toBe(columns);
  });

  it('maps legacy task sessions onto board items', () => {
    expect(boardItemFromTaskSession(task('r', 'running', { conversation_id: 'c1' }))).toMatchObject({
      id: 'r',
      board_status: 'in_progress',
      conversation_id: 'c1',
      assignee: null,
      labels: [],
      board_rank: null,
    });
  });

  it('decodes board transition rejections and API availability', () => {
    const rejected = httpError(409, {
      error: 'x',
      code: 'board_transition_rejected',
      details: { from: 'backlog', to: 'in_progress', reason: 'backlog_not_started' },
    });
    expect(boardRejectionReason(rejected)).toBe('backlog_not_started');
    expect(boardErrorKey(rejected)).toBe('conversation.taskBoard.errors.backlog_not_started');
    expect(boardRejectionReason(httpError(409, { code: 'board_transition_rejected', details: { reason: '??' } }))).toBe(
      'not_allowed'
    );
    expect(boardRejectionReason(httpError(409, { code: 'other' }))).toBeNull();
    expect(boardErrorKey(new Error('x'))).toBe('conversation.taskBoard.errors.generic');
    expect(isBoardApiUnavailable(httpError(404, 'nope'))).toBe(true);
    expect(isBoardApiUnavailable(httpError(405, 'nope'))).toBe(true);
    expect(isBoardApiUnavailable(httpError(500, 'nope'))).toBe(false);
  });

  it('parses timeline entries and the comment edit window', () => {
    expect(parseTimelineEntry(entry('comment', '{"not":"json-event"}'))).toEqual({
      kind: 'comment',
      text: '{"not":"json-event"}',
    });
    expect(parseTimelineEntry(entry('status_change', '{"from":"todo","to":"in_progress"}'))).toEqual({
      kind: 'status_change',
      from: 'todo',
      to: 'in_progress',
    });
    expect(parseTimelineEntry(entry('assignment', '{"assignee":{"kind":"squad","id":"s1"}}'))).toEqual({
      kind: 'assignment',
      assignee: { kind: 'squad', id: 's1' },
    });
    expect(parseTimelineEntry(entry('assignment', '{"assignee":null}'))).toEqual({
      kind: 'assignment',
      assignee: null,
    });
    expect(parseTimelineEntry(entry('review_decision', '{"decision":"reject","comment":"redo"}'))).toEqual({
      kind: 'review_decision',
      decision: 'reject',
      comment: 'redo',
    });
    expect(parseTimelineEntry(entry('status_change', 'garbage'))).toEqual({ kind: 'unknown', text: 'garbage' });

    const now = 20 * 60 * 1000;
    expect(canEditComment(entry('comment', 'x', { created_at: now - 60_000 }), now)).toBe(true);
    expect(canEditComment(entry('comment', 'x', { created_at: 0 }), now)).toBe(false);
    expect(canEditComment(entry('comment', 'x', { created_at: now, author_kind: 'agent' }), now)).toBe(false);
    expect(canEditComment(entry('status_change', '{}', { created_at: now }), now)).toBe(false);
  });
});

describe('realtime and optimistic-lock helpers', () => {
  const stale = new BackendHttpError({
    method: 'PATCH',
    path: '/api/task-sessions/t/board',
    status: 409,
    body: { error: 'stale', code: 'board_item_stale', details: { expected_updated_at: 1, current_updated_at: 2 } },
  });

  it('maps board_item_stale to its own message', () => {
    expect(isBoardItemStale(stale)).toBe(true);
    expect(boardErrorKey(stale)).toBe('conversation.taskBoard.errors.stale');
    expect(isBoardItemStale(new Error('x'))).toBe(false);
  });

  it('applies newer server copies, ignores older ones and inserts unknown items', () => {
    const columns = columnsFromBoardResponse({
      columns: [{ board_status: 'todo', items: [boardItem('a', 'todo', { updated_at: 5 })] }],
    });
    const moved = applyBoardItem(columns, boardItem('a', 'in_progress', { updated_at: 6 }));
    expect(moved.in_progress.map((i) => i.id)).toEqual(['a']);
    expect(moved.todo).toEqual([]);
    expect(applyBoardItem(moved, boardItem('a', 'todo', { updated_at: 5 }))).toBe(moved);
    const inserted = applyBoardItem(moved, boardItem('b', 'backlog', { updated_at: 1 }));
    expect(inserted.backlog.map((i) => i.id)).toEqual(['b']);
  });

  it('upserts timeline entries by id in creation order', () => {
    const a = entry('comment', 'a', { id: 'a', created_at: 1 });
    const c = entry('comment', 'c', { id: 'c', created_at: 3 });
    const b = entry('comment', 'b', { id: 'b', created_at: 2 });
    const list = upsertComment(upsertComment([a, c], b), b);
    expect(list.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(upsertComment(list, { ...b, body: 'edited', edited_at: 4 })[1].body).toBe('edited');
  });
});

describe('mergeBoardTimeline (E6-6)', () => {
  const comment = (id: string, created_at: number, extra: Partial<TaskComment> = {}): TaskComment => ({
    id,
    task_session_id: 't1',
    kind: 'comment',
    body: id,
    author_kind: 'user',
    author_id: 'u1',
    created_at,
    ...extra,
  });

  const trace = (
    event_id: string,
    timestamp: number,
    event_type: string,
    payload: Record<string, unknown> = {},
    sequence = 1
  ) => ({
    event_id,
    task_id: 't1',
    run_id: 'r1',
    sequence,
    timestamp,
    event_type,
    payload,
  });

  it('keeps comments only when there is no high-signal trace', () => {
    const rows = mergeBoardTimeline([comment('c1', 10)], [trace('e1', 5, 'tool.started')]);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('comment');
  });

  it('merges denied / failed / file.changed and sorts by time', () => {
    const rows = mergeBoardTimeline(
      [comment('c1', 20)],
      [
        trace('e1', 10, 'tool.denied', { tool: 'Bash' }, 1),
        trace('e2', 30, 'file.changed', { path: 'a.ts' }, 2),
        trace('e3', 15, 'tool.allowed', { tool: 'Read' }, 3),
      ]
    );
    expect(rows.map((r) => r.id)).toEqual(['t:e1', 'c:c1', 't:e2']);
    expect(rows[0].source === 'trace' && rows[0].trace.summary).toEqual({
      kind: 'tool_denied',
      tool: 'Bash',
    });
    expect(rows[2].source === 'trace' && rows[2].trace.summary).toEqual({
      kind: 'file_changed',
      path: 'a.ts',
    });
  });

  it('caps trace rows at BOARD_TIMELINE_TRACE_CAP (keeps newest)', () => {
    const many = Array.from({ length: BOARD_TIMELINE_TRACE_CAP + 5 }, (_, i) =>
      trace(`e${i}`, i + 1, 'tool.denied', { tool: `t${i}` }, i + 1)
    );
    const rows = mergeBoardTimeline([], many);
    expect(rows).toHaveLength(BOARD_TIMELINE_TRACE_CAP);
    expect(rows[0].id).toBe(`t:e5`);
    expect(rows[rows.length - 1].id).toBe(`t:e${BOARD_TIMELINE_TRACE_CAP + 4}`);
  });
});
