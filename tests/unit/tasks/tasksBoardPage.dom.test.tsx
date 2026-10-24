import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type {
  TaskBoardItem,
  TaskBoardResponse,
  TaskBoardStatus,
  TaskComment,
  TaskSession,
} from '@/common/types/agent/taskSession';

const mocks = vi.hoisted(() => ({
  boardGet: vi.fn(),
  boardUpdate: vi.fn(),
  review: vi.fn(),
  commentsList: vi.fn(),
  commentsCreate: vi.fn(),
  commentsEdit: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  navigate: vi.fn(),
  listeners: new Map<string, Set<(payload: unknown) => void>>(),
}));

const { wsEmitter } = vi.hoisted(() => ({
  wsEmitter: (name: string) => ({
    on: (cb: (payload: unknown) => void) => {
      if (!mocks.listeners.has(name)) mocks.listeners.set(name, new Set());
      mocks.listeners.get(name)!.add(cb);
      return () => {
        mocks.listeners.get(name)?.delete(cb);
      };
    },
  }),
}));

const push = (name: string, payload: unknown) =>
  act(() => {
    for (const cb of mocks.listeners.get(name) ?? []) cb(payload);
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

vi.mock('@/common', () => ({
  ipcBridge: {
    taskSession: {
      list: { invoke: mocks.list },
      get: { invoke: mocks.get },
      board: {
        get: { invoke: mocks.boardGet },
        update: { invoke: mocks.boardUpdate },
        review: { invoke: mocks.review },
        comments: {
          list: { invoke: mocks.commentsList },
          create: { invoke: mocks.commentsCreate },
          edit: { invoke: mocks.commentsEdit },
          created: wsEmitter('task.comment.created'),
          updated: wsEmitter('task.comment.updated'),
        },
        updated: wsEmitter('task.board.updated'),
      },
    },
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'from' in opts ? `${key}:${String(opts.from)}>${String(opts.to)}` : key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

// Arco Descriptions (detail drawer) reads responsive breakpoints.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

import TasksBoardPage from '@/renderer/pages/tasks/TasksBoardPage';

const ORDER: TaskBoardStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'];

const item = (id: string, board_status: TaskBoardStatus, extra: Partial<TaskBoardItem> = {}): TaskBoardItem => ({
  id,
  title: `Task ${id}`,
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
  created_at: 1,
  updated_at: 1,
  ...extra,
});

const board = (...items: TaskBoardItem[]): TaskBoardResponse => ({
  columns: ORDER.map((board_status) => ({ board_status, items: items.filter((i) => i.board_status === board_status) })),
});

const session = (id: string, extra: Partial<TaskSession> = {}): TaskSession => ({
  id,
  title: `Task ${id}`,
  mode: 'agent',
  objective: '',
  acceptance_criteria: [],
  status: 'draft',
  agent_type: 'claude',
  created_at: 0,
  updated_at: 0,
  ...extra,
});

const comment = (id: string, extra: Partial<TaskComment> = {}): TaskComment => ({
  id,
  task_session_id: 't',
  author_kind: 'user',
  author_id: 'me',
  kind: 'comment',
  body: 'hello',
  created_at: Date.now(),
  edited_at: null,
  ...extra,
});

const conflict = (reason: string) =>
  new BackendHttpError({
    method: 'PATCH',
    path: '/api/task-sessions/x/board',
    status: 409,
    body: { error: 'rejected', code: 'board_transition_rejected', details: { from: 'backlog', to: 'todo', reason } },
  });

const column = (status: TaskBoardStatus) => screen.getByTestId(`tasks-board-column-${status}`);

const chooseMoveTarget = async (status: TaskBoardStatus) => {
  const select = screen.getByTestId('task-board-detail-move');
  fireEvent.click(select.querySelector('.arco-select-view') ?? select);
  const options = await screen.findAllByText(`conversation.taskBoard.columns.${status}`);
  fireEvent.click(options.find((n) => n.closest('.arco-select-option')) ?? options[options.length - 1]);
};

describe('TasksBoardPage', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) if (typeof m === 'function') m.mockReset();
    mocks.listeners.clear();
    mocks.get.mockImplementation(({ id }: { id: string }) => Promise.resolve(session(id)));
    mocks.commentsList.mockResolvedValue([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the board API columns in board_rank order and hides cancelled by default', async () => {
    mocks.boardGet.mockResolvedValue(
      board(
        item('b2', 'todo', { board_rank: 'b' }),
        item('b1', 'todo', { board_rank: 'a' }),
        item('bn', 'todo', { updated_at: 9 }),
        item('r', 'in_progress', { status: 'running', priority: 4, labels: ['ui'] }),
        item('x', 'cancelled')
      )
    );
    render(<TasksBoardPage />);

    const todo = await screen.findByTestId('tasks-board-column-todo');
    expect(
      within(todo)
        .getAllByTestId(/^task-board-card-b/)
        .map((n) => n.dataset.testid)
    ).toEqual(['task-board-card-b1', 'task-board-card-b2', 'task-board-card-bn']);
    const running = within(column('in_progress')).getByTestId('task-board-card-r');
    expect(within(running).getByTestId('task-board-card-run-badge').textContent).toBe(
      'conversation.taskBoard.run.running'
    );
    expect(within(running).getByTestId('task-board-card-priority').textContent).toBe(
      'conversation.taskBoard.priority.urgent'
    );
    expect(screen.queryByTestId('tasks-board-legacy-notice')).toBeNull();
    expect(screen.queryByTestId('tasks-board-column-cancelled')).toBeNull();
    expect(mocks.boardGet).toHaveBeenCalledWith({});
    expect(mocks.list).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('switch'));
    expect(within(column('cancelled')).getByTestId('task-board-card-x')).toBeTruthy();
  });

  it('falls back to the read-only task-session list on cores without the board API', async () => {
    mocks.boardGet.mockRejectedValue(
      new BackendHttpError({ method: 'GET', path: '/api/task-sessions/board', status: 404, body: 'not found' })
    );
    mocks.list.mockResolvedValue([session('r', { status: 'running' }), session('c', { status: 'completed' })]);
    render(<TasksBoardPage />);

    await screen.findByTestId('tasks-board-legacy-notice');
    expect(within(column('in_progress')).getByTestId('task-board-card-r')).toBeTruthy();
    expect(within(column('done')).getByTestId('task-board-card-c')).toBeTruthy();

    fireEvent.click(screen.getByTestId('task-board-card-r'));
    await screen.findByTestId('task-board-detail');
    expect(screen.queryByTestId('task-board-detail-move')).toBeNull();
    expect(screen.queryByTestId('task-board-assignee')).toBeNull();
    expect(screen.queryByTestId('task-board-timeline')).toBeNull();
  });

  it('shows details from the task session and jumps to the linked conversation', async () => {
    mocks.boardGet.mockResolvedValue(board(item('r', 'in_progress', { conversation_id: 'conv-r' })));
    mocks.get.mockResolvedValue(
      session('r', { objective: 'Ship the board', acceptance_criteria: ['columns render', 'drawer opens'] })
    );
    render(<TasksBoardPage />);

    fireEvent.click(await screen.findByTestId('task-board-card-r'));
    await waitFor(() => expect(screen.getByTestId('task-board-detail-objective').textContent).toBe('Ship the board'));
    expect(
      within(screen.getByTestId('task-board-detail-criteria'))
        .getAllByRole('listitem')
        .map((n) => n.textContent)
    ).toEqual(['columns render', 'drawer opens']);
    fireEvent.click(screen.getByTestId('task-board-detail-open-conversation'));
    expect(mocks.navigate).toHaveBeenCalledWith('/conversation/conv-r');
  });

  it('moves a card optimistically and refetches when no realtime push confirms it', async () => {
    mocks.boardGet.mockResolvedValueOnce(board(item('t', 'todo')));
    mocks.boardUpdate.mockResolvedValue(item('t', 'in_progress', { updated_at: 5 }));
    mocks.boardGet.mockResolvedValue(board(item('t', 'in_progress', { updated_at: 5 })));
    render(<TasksBoardPage />);

    fireEvent.click(await screen.findByTestId('task-board-card-t'));
    await screen.findByTestId('task-board-detail');
    await chooseMoveTarget('in_progress');

    await waitFor(() => expect(within(column('in_progress')).getByTestId('task-board-card-t')).toBeTruthy());
    expect(mocks.boardUpdate).toHaveBeenCalledWith({
      id: 't',
      updates: { board_status: 'in_progress', expected_updated_at: 1 },
    });
    expect(mocks.boardGet).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.boardGet).toHaveBeenCalledTimes(2), { timeout: 3000 });
  });

  it('skips the fallback refetch when the push confirms the move', async () => {
    mocks.boardGet.mockResolvedValue(board(item('t', 'todo')));
    const moved = item('t', 'in_progress', { updated_at: 5 });
    mocks.boardUpdate.mockResolvedValue(moved);
    render(<TasksBoardPage />);

    fireEvent.click(await screen.findByTestId('task-board-card-t'));
    await screen.findByTestId('task-board-detail');
    await chooseMoveTarget('in_progress');
    await waitFor(() => expect(mocks.boardUpdate).toHaveBeenCalled());
    push('task.board.updated', {
      user_id: 'u',
      task_session_id: 't',
      change: 'board',
      from_board_status: 'todo',
      item: moved,
    });
    await act(() => sleep(1800));
    expect(mocks.boardGet).toHaveBeenCalledTimes(1);
    expect(within(column('in_progress')).getByTestId('task-board-card-t')).toBeTruthy();
  });

  it('applies pushes from elsewhere and ignores older copies', async () => {
    mocks.boardGet.mockResolvedValue(board(item('t', 'todo', { updated_at: 3 })));
    render(<TasksBoardPage />);
    await screen.findByTestId('task-board-card-t');

    const event = (board_status: TaskBoardStatus, updated_at: number) => ({
      user_id: 'u',
      task_session_id: 't',
      change: 'board',
      from_board_status: 'todo',
      item: item('t', board_status, { updated_at }),
    });
    push('task.board.updated', event('in_progress', 9));
    expect(within(column('in_progress')).getByTestId('task-board-card-t')).toBeTruthy();
    push('task.board.updated', event('backlog', 4));
    expect(within(column('in_progress')).getByTestId('task-board-card-t')).toBeTruthy();
    expect(within(column('backlog')).queryByTestId('task-board-card-t')).toBeNull();
    push('task.board.updated', {
      ...event('todo', 10),
      task_session_id: 'n',
      item: item('n', 'todo', { updated_at: 10 }),
    });
    expect(within(column('todo')).getByTestId('task-board-card-n')).toBeTruthy();
    expect(mocks.boardGet).toHaveBeenCalledTimes(1);
  });

  it('rolls back a stale move, refetches and asks to retry', async () => {
    const warning = vi.spyOn(Message, 'warning').mockImplementation(() => () => {});
    mocks.boardGet.mockResolvedValueOnce(board(item('t', 'todo', { updated_at: 2 })));
    mocks.boardGet.mockResolvedValue(board(item('t', 'backlog', { updated_at: 7 })));
    mocks.boardUpdate.mockRejectedValue(
      new BackendHttpError({
        method: 'PATCH',
        path: '/api/task-sessions/t/board',
        status: 409,
        body: { error: 'stale', code: 'board_item_stale', details: { expected_updated_at: 2, current_updated_at: 7 } },
      })
    );
    render(<TasksBoardPage />);

    fireEvent.click(await screen.findByTestId('task-board-card-t'));
    await screen.findByTestId('task-board-detail');
    await chooseMoveTarget('in_progress');

    await waitFor(() => expect(warning).toHaveBeenCalledWith('conversation.taskBoard.errors.stale'));
    expect(mocks.boardUpdate).toHaveBeenCalledWith({
      id: 't',
      updates: { board_status: 'in_progress', expected_updated_at: 2 },
    });
    await waitFor(() => expect(within(column('backlog')).getByTestId('task-board-card-t')).toBeTruthy());
    expect(within(column('in_progress')).queryByTestId('task-board-card-t')).toBeNull();
  });

  it('rolls a rejected move back and explains the reason', async () => {
    const error = vi.spyOn(Message, 'error').mockImplementation(() => () => {});
    mocks.boardGet.mockResolvedValue(board(item('t', 'todo', { mode: 'plan' })));
    mocks.boardUpdate.mockRejectedValue(conflict('plan_not_approved'));
    render(<TasksBoardPage />);

    fireEvent.click(await screen.findByTestId('task-board-card-t'));
    await screen.findByTestId('task-board-detail');
    await chooseMoveTarget('in_progress');

    await waitFor(() => expect(error).toHaveBeenCalledWith('conversation.taskBoard.errors.plan_not_approved'));
    expect(within(column('todo')).getByTestId('task-board-card-t')).toBeTruthy();
    expect(within(column('in_progress')).queryByTestId('task-board-card-t')).toBeNull();
  });

  it('requires a comment to reject and submits review decisions', async () => {
    const warning = vi.spyOn(Message, 'warning').mockImplementation(() => () => {});
    mocks.boardGet.mockResolvedValueOnce(board(item('v', 'in_review')));
    mocks.boardGet.mockResolvedValue(board(item('v', 'todo')));
    mocks.review.mockResolvedValue({ item: item('v', 'todo'), decision: comment('d', { kind: 'review_decision' }) });
    render(<TasksBoardPage />);

    fireEvent.click(await screen.findByTestId('task-board-card-v'));
    await screen.findByTestId('task-board-review');
    fireEvent.click(screen.getByTestId('task-board-review-reject'));
    expect(warning).toHaveBeenCalledWith('conversation.taskBoard.review.rejectNeedsComment');
    expect(mocks.review).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('task-board-review-comment'), { target: { value: ' needs tests ' } });
    fireEvent.click(screen.getByTestId('task-board-review-reject'));
    await waitFor(() =>
      expect(mocks.review).toHaveBeenCalledWith({ id: 'v', decision: 'reject', comment: 'needs tests' })
    );
    await waitFor(() => expect(within(column('todo')).getByTestId('task-board-card-v')).toBeTruthy());
  });

  it('approves an in-review item without a comment', async () => {
    mocks.boardGet.mockResolvedValue(board(item('v', 'in_review')));
    mocks.review.mockResolvedValue({ item: item('v', 'done'), decision: comment('d', { kind: 'review_decision' }) });
    render(<TasksBoardPage />);

    fireEvent.click(await screen.findByTestId('task-board-card-v'));
    fireEvent.click(await screen.findByTestId('task-board-review-approve'));
    await waitFor(() => expect(mocks.review).toHaveBeenCalledWith({ id: 'v', decision: 'approve' }));
  });

  it('assigns and unassigns', async () => {
    mocks.boardGet.mockResolvedValue(board(item('t', 'todo', { assignee: { kind: 'user', id: 'u1' } })));
    mocks.boardUpdate.mockResolvedValue(item('t', 'todo', { assignee: { kind: 'user', id: 'u2' }, updated_at: 2 }));
    render(<TasksBoardPage />);

    fireEvent.click(await screen.findByTestId('task-board-card-t'));
    await screen.findByTestId('task-board-assignee');
    fireEvent.change(screen.getByTestId('task-board-assignee-id'), { target: { value: 'u2' } });
    fireEvent.click(screen.getByTestId('task-board-assignee-save'));
    await waitFor(() =>
      expect(mocks.boardUpdate).toHaveBeenCalledWith({
        id: 't',
        updates: { assignee: { kind: 'user', id: 'u2' }, expected_updated_at: 1 },
      })
    );
    fireEvent.click(screen.getByTestId('task-board-assignee-clear'));
    await waitFor(() =>
      expect(mocks.boardUpdate).toHaveBeenCalledWith({ id: 't', updates: { assignee: null, expected_updated_at: 2 } })
    );
  });

  it('renders the timeline, posts comments and maps edit-window conflicts', async () => {
    const error = vi.spyOn(Message, 'error').mockImplementation(() => () => {});
    mocks.boardGet.mockResolvedValue(board(item('t', 'todo')));
    mocks.commentsList.mockResolvedValue([
      comment('s', { kind: 'status_change', author_kind: 'system', body: '{"from":"backlog","to":"todo"}' }),
      comment('a', { kind: 'assignment', body: '{"assignee":{"kind":"agent","id":"claude"}}' }),
      comment('m', { body: 'first note' }),
      comment('old', { body: 'old note', created_at: Date.now() - 20 * 60 * 1000 }),
    ]);
    mocks.commentsCreate.mockResolvedValue(comment('n', { body: 'second note' }));
    mocks.commentsEdit.mockRejectedValue(
      new BackendHttpError({ method: 'PATCH', path: '/x', status: 409, body: { error: 'window', code: '' } })
    );
    render(<TasksBoardPage />);

    fireEvent.click(await screen.findByTestId('task-board-card-t'));
    const status = await screen.findByTestId('task-board-timeline-entry-s');
    expect(status.textContent).toContain(
      'conversation.taskBoard.timeline.statusChange:conversation.taskBoard.columns.backlog>conversation.taskBoard.columns.todo'
    );
    expect(screen.getByTestId('task-board-timeline-entry-a').textContent).toContain(
      'conversation.taskBoard.timeline.assigned'
    );
    expect(screen.getByTestId('task-board-timeline-edit-m')).toBeTruthy();
    expect(screen.queryByTestId('task-board-timeline-edit-old')).toBeNull();
    expect(screen.queryByTestId('task-board-timeline-edit-s')).toBeNull();

    fireEvent.change(screen.getByTestId('task-board-timeline-input'), { target: { value: 'second note' } });
    fireEvent.click(screen.getByTestId('task-board-timeline-submit'));
    await screen.findByTestId('task-board-timeline-entry-n');
    expect(mocks.commentsCreate).toHaveBeenCalledWith({ id: 't', body: 'second note' });

    fireEvent.click(screen.getByTestId('task-board-timeline-edit-m'));
    fireEvent.change(screen.getByTestId('task-board-timeline-edit-input'), { target: { value: 'changed' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('task-board-timeline-edit-save'));
    });
    await waitFor(() => expect(error).toHaveBeenCalledWith('conversation.taskBoard.errors.commentEditWindow'));
    expect(mocks.commentsEdit).toHaveBeenCalledWith({ id: 't', comment_id: 'm', body: 'changed' });
  });

  it('adds pushed timeline entries of the open item once', async () => {
    mocks.boardGet.mockResolvedValue(board(item('t', 'todo')));
    mocks.commentsList.mockResolvedValue([comment('m', { body: 'first note', created_at: 1 })]);
    render(<TasksBoardPage />);

    fireEvent.click(await screen.findByTestId('task-board-card-t'));
    await screen.findByTestId('task-board-timeline-entry-m');
    const pushed = comment('s', {
      kind: 'status_change',
      author_kind: 'system',
      body: '{"from":"todo","to":"backlog"}',
    });
    push('task.comment.created', { user_id: 'u', task_session_id: 't', comment: pushed });
    push('task.comment.created', { user_id: 'u', task_session_id: 't', comment: pushed });
    push('task.comment.created', {
      user_id: 'u',
      task_session_id: 'other',
      comment: comment('o', { task_session_id: 'other' }),
    });
    expect(screen.getAllByTestId('task-board-timeline-entry-s')).toHaveLength(1);
    expect(screen.queryByTestId('task-board-timeline-entry-o')).toBeNull();
    push('task.comment.updated', {
      user_id: 'u',
      task_session_id: 't',
      comment: comment('m', { body: 'edited note', created_at: 1, edited_at: 2 }),
    });
    expect(screen.getByTestId('task-board-timeline-entry-m').textContent).toContain('edited note');
  });

  it('shows a retry state when loading fails', async () => {
    mocks.boardGet.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(board(item('d', 'backlog')));
    render(<TasksBoardPage />);

    await screen.findByTestId('tasks-board-failed');
    fireEvent.click(screen.getByText('conversation.taskBoard.retry'));
    await waitFor(() => expect(screen.getByTestId('task-board-card-d')).toBeTruthy());
    expect(mocks.boardGet).toHaveBeenCalledTimes(2);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
