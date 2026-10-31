/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M8 E6-8 / E7-7 — demo① end to end on the board UI against a scripted Core:
 * Inbox deep link → assign a Squad → start it for the work item (Q12 shared
 * worktree) → Leader route_only round evaluations land on the timeline →
 * members' changes show as a diff summary → Core moves the card to in_review
 * → approve → done, worktree kept (system note). A second case rejects back
 * to todo and restarts on the same worktree.
 *
 * The fake Core below keeps one consistent state and answers every board,
 * comment, Squad, team and worktree call from it; Core-originated events
 * (run progress, Leader evaluations, auto in_review) are pushed by the test
 * over the mocked WS emitters, so nothing depends on timers.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type {
  TaskAssignee,
  TaskBoardItem,
  TaskBoardResponse,
  TaskBoardStatus,
  TaskComment,
} from '@/common/types/agent/taskSession';
import type { SquadRunPayload } from '@/common/types/agent/squadRun';
import type { TTeam } from '@/common/types/team/teamTypes';
import type { WorktreeDiffStat, WorktreeInfo } from '@/common/types/worktree';

const ORDER: TaskBoardStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'];
const TEMPLATE = 'sq-release';
const REPO = '/repo/app';
const WT_PATH = '/repo/.workmate-worktrees/w1';
const WT_BRANCH = 'workmate/w1-ship-login';

type CoreState = {
  clock: number;
  items: Map<string, TaskBoardItem>;
  comments: Map<string, TaskComment[]>;
  worktrees: WorktreeInfo[];
  teams: TTeam[];
  diffStat: WorktreeDiffStat | null;
  instantiateCalls: unknown[];
};

const h = vi.hoisted(() => ({
  listeners: new Map<string, Set<(payload: unknown) => void>>(),
  core: null as unknown as CoreState,
  searchParams: new URLSearchParams(),
  navigate: vi.fn(),
  setSearchParams: vi.fn(),
  api: {
    boardGet: vi.fn(),
    boardUpdate: vi.fn(),
    review: vi.fn(),
    commentsList: vi.fn(),
    commentsCreate: vi.fn(),
    commentsEdit: vi.fn(),
    runList: vi.fn(),
    runReplay: vi.fn(),
    sessionList: vi.fn(),
    sessionGet: vi.fn(),
    squadsList: vi.fn(),
    instantiate: vi.fn(),
    teamList: vi.fn(),
    getSquadRun: vi.fn(),
    worktreeList: vi.fn(),
    diffStat: vi.fn(),
  },
}));

const { wsEmitter } = vi.hoisted(() => ({
  wsEmitter: (name: string) => ({
    on: (cb: (payload: unknown) => void) => {
      if (!h.listeners.has(name)) h.listeners.set(name, new Set());
      h.listeners.get(name)!.add(cb);
      return () => {
        h.listeners.get(name)?.delete(cb);
      };
    },
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    taskSession: {
      list: { invoke: h.api.sessionList },
      get: { invoke: h.api.sessionGet },
      board: {
        get: { invoke: h.api.boardGet },
        update: { invoke: h.api.boardUpdate },
        review: { invoke: h.api.review },
        comments: {
          list: { invoke: h.api.commentsList },
          create: { invoke: h.api.commentsCreate },
          edit: { invoke: h.api.commentsEdit },
          created: wsEmitter('task.comment.created'),
          updated: wsEmitter('task.comment.updated'),
        },
        updated: wsEmitter('task.board.updated'),
      },
      run: { list: { invoke: h.api.runList }, replay: { invoke: h.api.runReplay } },
    },
    taskTrace: { appended: wsEmitter('task.trace.appended') },
    squads: { list: { invoke: h.api.squadsList }, instantiate: { invoke: h.api.instantiate } },
    team: { list: { invoke: h.api.teamList }, getSquadRun: { invoke: h.api.getSquadRun } },
    worktree: {
      list: { invoke: h.api.worktreeList },
      diffStat: { invoke: h.api.diffStat },
      changed: wsEmitter('worktree.changed'),
    },
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => h.navigate,
  useSearchParams: () => [h.searchParams, h.setSearchParams],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'from' in opts
        ? `${key}:${String(opts.from)}>${String(opts.to)}`
        : opts && 'files' in opts
          ? `${key}:${String(opts.files)}/+${String(opts.additions)}/-${String(opts.deletions)}`
          : key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => ({ isMobile: false }) }));
vi.mock('@renderer/hooks/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

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

// ---------------------------------------------------------------- fake Core

const tick = (): number => (h.core.clock += 1000);

const workItem = (): TaskBoardItem => ({
  id: 'w1',
  title: 'Ship the login page',
  project_id: 'p1',
  conversation_id: null,
  mode: 'agent',
  status: 'draft',
  board_status: 'todo',
  assignee: null,
  priority: 3,
  labels: ['demo'],
  board_rank: 'a0',
  external_ref: null,
  created_at: 1_000,
  updated_at: 1_000,
});

const freshCore = (): CoreState => ({
  clock: 1_700_000_000_000,
  items: new Map([['w1', workItem()]]),
  comments: new Map([['w1', []]]),
  worktrees: [],
  teams: [],
  diffStat: null,
  instantiateCalls: [],
});

const coded = (status: number, code: string, details?: unknown) =>
  new BackendHttpError({ method: 'POST', path: '/api', status, body: { error: code, code, details } });

const addComment = (
  itemId: string,
  author_kind: TaskComment['author_kind'],
  author_id: string,
  kind: TaskComment['kind'],
  body: string
): TaskComment => {
  const created: TaskComment = {
    id: `c${(h.core.comments.get(itemId) ?? []).length + 1}-${h.core.clock}`,
    task_session_id: itemId,
    author_kind,
    author_id,
    kind,
    body,
    created_at: tick(),
    edited_at: null,
  };
  h.core.comments.set(itemId, [...(h.core.comments.get(itemId) ?? []), created]);
  return created;
};

const patchItem = (id: string, patch: Partial<TaskBoardItem>): TaskBoardItem => {
  const next = { ...(h.core.items.get(id) as TaskBoardItem), ...patch, updated_at: tick() };
  h.core.items.set(id, next);
  return next;
};

const boardResponse = (): TaskBoardResponse => ({
  columns: ORDER.map((board_status) => ({
    board_status,
    items: [...h.core.items.values()].filter((i) => i.board_status === board_status),
  })),
});

const installCore = () => {
  h.core = freshCore();
  const { api } = h;
  api.boardGet.mockImplementation(async () => boardResponse());
  api.sessionList.mockResolvedValue([]);
  api.sessionGet.mockImplementation(async ({ id }: { id: string }) => ({
    id,
    title: h.core.items.get(id)?.title ?? id,
    mode: 'agent',
    objective: 'Login page with SSO',
    acceptance_criteria: ['SSO button works', 'Tests pass'],
    status: 'draft',
    agent_type: 'claude',
    created_at: 0,
    updated_at: 0,
  }));
  api.commentsList.mockImplementation(async ({ id }: { id: string }) => [...(h.core.comments.get(id) ?? [])]);
  api.commentsCreate.mockImplementation(async ({ id, body }: { id: string; body: string }) =>
    addComment(id, 'user', 'u1', 'comment', body)
  );
  api.runList.mockResolvedValue([]);
  api.squadsList.mockResolvedValue([{ id: TEMPLATE, name: 'Release Squad' }]);
  // E6-5: assigning a Squad on a non-backlog item writes the plain-text 「已开工」 assignment note.
  api.boardUpdate.mockImplementation(
    async ({ id, updates }: { id: string; updates: { assignee?: TaskAssignee | null; board_status?: string } }) => {
      const current = h.core.items.get(id) as TaskBoardItem;
      if (updates.assignee !== undefined) {
        const next = patchItem(id, { assignee: updates.assignee });
        if (updates.assignee?.kind === 'squad' && current.board_status !== 'backlog') {
          addComment(id, 'user', 'u1', 'assignment', `已开工：已指派给 Squad ${updates.assignee.id}`);
        }
        return next;
      }
      return patchItem(id, { board_status: updates.board_status as TaskBoardStatus });
    }
  );
  // E7-6b / Q12: instance linked to the work item; the first one creates the shared worktree.
  api.instantiate.mockImplementation(
    async ({ id, input }: { id: string; input: { work_item_id?: string; repo_path?: string } }) => {
      h.core.instantiateCalls.push({ id, input });
      const item = input.work_item_id ? h.core.items.get(input.work_item_id) : undefined;
      if (!item) throw coded(404, 'squad_work_item_not_found');
      if (item.assignee?.kind !== 'squad' || item.assignee.id !== id) throw coded(409, 'squad_work_item_not_assigned');
      if (item.board_status === 'backlog') throw coded(409, 'squad_backlog_not_started');
      let wt = h.core.worktrees.find((w) => w.task_session_id === item.id && !w.removed_at);
      const reused = Boolean(wt);
      if (!wt) {
        if (!input.repo_path) {
          throw coded(400, 'squad_worktree_source_invalid', {
            work_item_id: item.id,
            reason: 'project folder is not a git repository',
          });
        }
        wt = {
          id: 'wt1',
          status: 'ready',
          source_repo_path: input.repo_path,
          repo_common_dir: `${input.repo_path}/.git`,
          path: WT_PATH,
          branch: WT_BRANCH,
          base_ref: 'main',
          base_commit: 'abc123',
          task_session_id: item.id,
          fanout_group_id: null,
          branch_preserved: true,
          created_at: tick(),
          updated_at: h.core.clock,
        };
        h.core.worktrees.push(wt);
      }
      const n = h.core.teams.length + 1;
      const run: SquadRunPayload = {
        team_id: `team-${n}`,
        state: 'running',
        leader_conversation_id: `leader-conv-${n}`,
        leader_mode: 'route_only',
        updated_at: tick(),
      };
      const team = {
        id: `team-${n}`,
        user_id: 'u1',
        name: `Release Squad #${n}`,
        workspace: wt.path,
        workspace_mode: 'shared',
        leader_assistant_id: 'leader',
        assistants: [],
        squad_template_id: id,
        squad_leader_mode: 'route_only',
        squad_run: run,
        created_at: h.core.clock,
        updated_at: h.core.clock,
      } as unknown as TTeam;
      h.core.teams.push(team);
      return {
        squad_template_id: id,
        team,
        work_item_id: item.id,
        worktree: {
          id: wt.id,
          path: wt.path,
          branch: wt.branch,
          source_repo_path: wt.source_repo_path,
          reused,
        },
      };
    }
  );
  api.teamList.mockImplementation(async () => [...h.core.teams]);
  api.getSquadRun.mockImplementation(async ({ team_id }: { team_id: string }) => {
    return h.core.teams.find((team) => team.id === team_id)?.squad_run ?? null;
  });
  api.worktreeList.mockImplementation(async () => [...h.core.worktrees]);
  api.diffStat.mockImplementation(async ({ id }: { id: string }) => {
    if (!h.core.diffStat) throw coded(404, 'NOT_FOUND');
    return { ...h.core.diffStat, worktree_id: id };
  });
  // E6-4 review gate; Q12: closing keeps the shared worktree and says so in a system note.
  api.review.mockImplementation(
    async ({ id, decision, comment }: { id: string; decision: 'approve' | 'reject'; comment?: string }) => {
      const to: TaskBoardStatus = decision === 'approve' ? 'done' : 'todo';
      const item = patchItem(id, { board_status: to, status: decision === 'approve' ? 'completed' : 'draft' });
      const decisionComment = addComment(
        id,
        'user',
        'u1',
        'review_decision',
        JSON.stringify({ decision, comment: comment ?? null })
      );
      if (to === 'done') {
        const wt = h.core.worktrees.find((w) => w.task_session_id === id);
        if (wt) {
          addComment(
            id,
            'system',
            'worktree',
            'comment',
            `工作项已完成；共享 worktree 已保留，未删除：${wt.path}（分支 ${wt.branch}）`
          );
        }
      }
      return { item, decision: decisionComment };
    }
  );
};

// ------------------------------------------------------------ Core pushes

const push = (name: string, payload: unknown) =>
  act(() => {
    for (const cb of h.listeners.get(name) ?? []) cb(payload);
  });

const pushItem = (id: string, change: 'board' | 'review' | 'squad_run' = 'board') =>
  push('task.board.updated', { item: h.core.items.get(id), change });

/** Push the comments Core wrote since `from` (the board emits `task.comment.created` per comment). */
const pushNewComments = (id: string, from: number) => {
  for (const comment of (h.core.comments.get(id) ?? []).slice(from)) {
    push('task.comment.created', { task_session_id: id, comment });
  }
};

const commentCount = (id: string) => (h.core.comments.get(id) ?? []).length;

/** E7-5: one Leader round evaluation, as Core appends it to the work item. */
const leaderEval = (round: number, members: string, tasks: string) => {
  const before = commentCount('w1');
  addComment(
    'w1',
    'agent',
    'leader',
    'comment',
    ['本轮评估：', `成员：${members}`, `任务：${tasks}`, `进行中：@w1: round ${round}`, '下一步：继续派发'].join('\n')
  );
  pushNewComments('w1', before);
};

// ------------------------------------------------------------------ UI

const renderBoard = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TasksBoardPage />
    </SWRConfig>
  );

const column = (status: TaskBoardStatus) => screen.getByTestId(`tasks-board-column-${status}`);
const drawer = () => screen.getByTestId('task-board-detail');
const timeline = () => screen.getByTestId('task-board-timeline');

const chooseOption = async (selectTestId: string, label: string) => {
  const select = screen.getByTestId(selectTestId);
  fireEvent.click(select.querySelector('.arco-select-view') ?? select);
  const options = await screen.findAllByText(label);
  fireEvent.click(options.find((n) => n.closest('.arco-select-option')) ?? options[options.length - 1]);
};

/** Inbox → `/tasks?task=w1` opens the drawer; then assign the Squad and start it on `/repo/app`. */
const openAssignAndStart = async () => {
  h.searchParams = new URLSearchParams('task=w1');
  renderBoard();
  await waitFor(() => expect(drawer()).toBeTruthy());
  expect(within(column('todo')).getByTestId('task-board-card-w1')).toBeTruthy();
  // The drawer opens before the session detail resolves; wait for the objective.
  await waitFor(() =>
    expect(screen.getByTestId('task-board-detail-objective').textContent).toBe('Login page with SSO')
  );

  // Assign: kind=squad → pick the template from GET /api/squads → save.
  await chooseOption('task-board-assignee-kind', 'conversation.taskBoard.assignee.kind.squad');
  await waitFor(() => expect(screen.getByTestId('task-board-assignee-squad')).toBeTruthy());
  await chooseOption('task-board-assignee-squad', 'Release Squad');
  const beforeAssign = commentCount('w1');
  fireEvent.click(screen.getByTestId('task-board-assignee-save'));
  await waitFor(() =>
    expect(h.api.boardUpdate).toHaveBeenCalledWith({
      id: 'w1',
      updates: { assignee: { kind: 'squad', id: TEMPLATE }, expected_updated_at: 1_000 },
    })
  );
  pushItem('w1');
  pushNewComments('w1', beforeAssign);
  await waitFor(() => expect(within(timeline()).getByText(/^已开工：已指派给 Squad/)).toBeTruthy());
  expect(within(screen.getByTestId('task-board-card-w1')).getByTestId('task-board-card-assignee')).toBeTruthy();

  // No instance yet → the run panel says so; start offers the repository field.
  await waitFor(() => expect(screen.getByTestId('task-board-squad-run-no-team')).toBeTruthy());
  fireEvent.change(within(screen.getByTestId('task-board-squad-start')).getByRole('textbox'), {
    target: { value: REPO },
  });
  fireEvent.click(screen.getByTestId('task-board-squad-start-button'));
  await waitFor(() =>
    expect(h.api.instantiate).toHaveBeenCalledWith({ id: TEMPLATE, input: { work_item_id: 'w1', repo_path: REPO } })
  );

  // Q12: the shared worktree shows in the drawer and as a branch tag on the card.
  await waitFor(() => expect(screen.getByTestId('task-board-worktree-path').textContent).toBe(WT_PATH));
  expect(screen.getByTestId('task-board-worktree-branch').textContent).toBe(WT_BRANCH);
  expect(within(screen.getByTestId('task-board-card-w1')).getByTestId('task-board-card-worktree').textContent).toBe(
    WT_BRANCH
  );
  // The team list is revalidated, so the instance's route_only Leader run appears.
  await waitFor(() => expect(screen.getByTestId('task-board-squad-run-team-1')).toBeTruthy());
  expect(
    within(screen.getByTestId('task-board-squad-run-team-1')).getByText('conversation.taskBoard.squadRun.routeOnly')
  ).toBeTruthy();
};

describe('M8 demo① — work item → Squad → in_review → done (E6-8 / E7-7)', () => {
  beforeEach(() => {
    for (const fn of Object.values(h.api)) fn.mockReset();
    h.navigate.mockReset();
    h.setSearchParams.mockReset();
    h.listeners.clear();
    installCore();
    vi.spyOn(Message, 'success').mockImplementation(() => () => {});
    vi.spyOn(Message, 'error').mockImplementation(() => () => {});
    vi.spyOn(Message, 'warning').mockImplementation(() => () => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('runs the happy path with Leader evaluations, worktree changes, review and a kept worktree', async () => {
    await openAssignAndStart();

    // Core starts the item (E7-6c squad_run push): card moves to in_progress with a running badge.
    patchItem('w1', {
      board_status: 'in_progress',
      status: 'running',
      squad_run: h.core.teams[0].squad_run,
    });
    pushItem('w1', 'squad_run');
    await waitFor(() => expect(within(column('in_progress')).getByTestId('task-board-card-w1')).toBeTruthy());
    expect(
      within(screen.getByTestId('task-board-card-w1'))
        .getByTestId('task-board-card-squad-run')
        .getAttribute('data-state')
    ).toBe('running');

    // E7-5: the route_only Leader writes one evaluation per round onto the work item.
    leaderEval(1, 'frontend=working；backend=idle', '1 pending / 1 in_progress / 0 completed');
    leaderEval(2, 'frontend=idle；backend=working', '0 pending / 1 in_progress / 1 completed');
    await waitFor(() => expect(timeline().querySelectorAll('[data-leader-eval="true"]').length).toBe(2));
    const evals = [...timeline().querySelectorAll('[data-leader-eval="true"]')];
    expect(evals[0].textContent).toContain('成员：frontend=working；backend=idle');
    expect(evals[1].textContent).toContain('任务：0 pending / 1 in_progress / 1 completed');
    expect(within(evals[0] as HTMLElement).getByText('conversation.taskBoard.timeline.leaderEval')).toBeTruthy();

    // Members produced changes on the shared branch; E6-5 moves the item to in_review as the Agent.
    h.core.diffStat = {
      worktree_id: 'wt1',
      base_commit: 'abc123',
      files: [],
      files_changed: 3,
      additions: 40,
      deletions: 2,
      truncated: false,
    };
    const beforeReview = commentCount('w1');
    patchItem('w1', { board_status: 'in_review', status: 'completed' });
    addComment('w1', 'agent', 'leader', 'status_change', JSON.stringify({ from: 'in_progress', to: 'in_review' }));
    pushItem('w1');
    pushNewComments('w1', beforeReview);
    await waitFor(() => expect(within(column('in_review')).getByTestId('task-board-card-w1')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('task-board-review')).toBeTruthy());
    expect(
      within(timeline()).getByText(
        'conversation.taskBoard.timeline.statusChange:conversation.taskBoard.columns.in_progress>conversation.taskBoard.columns.in_review'
      )
    ).toBeTruthy();
    // The start action is only offered while the item is todo / in_progress.
    expect(screen.queryByTestId('task-board-squad-start')).toBeNull();
    // The drawer reloads the shared worktree's diff summary once the card reaches in_review.
    await waitFor(() =>
      expect(screen.getByTestId('task-board-worktree-changes').textContent).toBe(
        'conversation.taskBoard.worktree.changesSummary:3/+40/-2'
      )
    );

    // Review: approve with a comment → done; Core keeps the worktree and notes it.
    fireEvent.change(screen.getByTestId('task-board-review-comment'), { target: { value: 'LGTM' } });
    const beforeApprove = commentCount('w1');
    fireEvent.click(screen.getByTestId('task-board-review-approve'));
    await waitFor(() => expect(h.api.review).toHaveBeenCalledWith({ id: 'w1', decision: 'approve', comment: 'LGTM' }));
    await waitFor(() => expect(within(column('done')).getByTestId('task-board-card-w1')).toBeTruthy());
    pushItem('w1', 'review');
    pushNewComments('w1', beforeApprove);
    push('worktree.changed', { worktree_id: 'wt1', status: 'ready' });

    await waitFor(() => expect(timeline().querySelector('[data-worktree-note="true"]')).not.toBeNull());
    expect(timeline().querySelector('[data-worktree-note="true"]')?.textContent).toContain(
      `共享 worktree 已保留，未删除：${WT_PATH}（分支 ${WT_BRANCH}）`
    );
    expect(within(timeline()).getByText('conversation.taskBoard.timeline.approved: LGTM')).toBeTruthy();
    expect(screen.queryByTestId('task-board-review')).toBeNull();
    // Closed item still shows its worktree, marked as kept.
    expect(screen.getByTestId('task-board-worktree-path').textContent).toBe(WT_PATH);
    expect(screen.getByTestId('task-board-worktree-hint').textContent).toBe('conversation.taskBoard.worktree.kept');
    expect(within(screen.getByTestId('task-board-card-w1')).getByTestId('task-board-card-worktree')).toBeTruthy();
    // Exactly one instance and one worktree were created.
    expect(h.core.instantiateCalls).toHaveLength(1);
    expect(h.core.worktrees).toHaveLength(1);
  });

  it('rejects back to todo and restarts the Squad on the same shared worktree', async () => {
    await openAssignAndStart();

    patchItem('w1', { board_status: 'in_review', status: 'completed', squad_run: h.core.teams[0].squad_run });
    pushItem('w1');
    await waitFor(() => expect(screen.getByTestId('task-board-review')).toBeTruthy());

    // Reject needs a comment; it sends the item back to todo.
    fireEvent.change(screen.getByTestId('task-board-review-comment'), { target: { value: 'Missing tests' } });
    fireEvent.click(screen.getByTestId('task-board-review-reject'));
    await waitFor(() =>
      expect(h.api.review).toHaveBeenCalledWith({ id: 'w1', decision: 'reject', comment: 'Missing tests' })
    );
    await waitFor(() => expect(within(column('todo')).getByTestId('task-board-card-w1')).toBeTruthy());

    // Restart: the worktree exists, so no repository field and Core reuses it.
    await waitFor(() => expect(screen.getByTestId('task-board-squad-start')).toBeTruthy());
    expect(screen.queryByTestId('task-board-squad-start-repo')).toBeNull();
    expect(screen.getByText('conversation.taskBoard.squadStart.reuseHint')).toBeTruthy();
    fireEvent.click(screen.getByTestId('task-board-squad-start-button'));
    await waitFor(() => expect(h.core.instantiateCalls).toHaveLength(2));
    expect(h.api.instantiate).toHaveBeenLastCalledWith({ id: TEMPLATE, input: { work_item_id: 'w1' } });
    await waitFor(() => expect(screen.getByTestId('task-board-squad-run-team-2')).toBeTruthy());
    expect(h.core.worktrees).toHaveLength(1);
    expect(screen.getByTestId('task-board-worktree-path').textContent).toBe(WT_PATH);
    // No kept-worktree note: the item was never closed.
    expect(timeline().querySelector('[data-worktree-note="true"]')).toBeNull();
  });

  it('explains a missing repository instead of starting the Squad', async () => {
    h.searchParams = new URLSearchParams('task=w1');
    patchItem('w1', { assignee: { kind: 'squad', id: TEMPLATE } });
    renderBoard();
    await waitFor(() => expect(screen.getByTestId('task-board-squad-start-button')).toBeTruthy());
    fireEvent.click(screen.getByTestId('task-board-squad-start-button'));
    await waitFor(() =>
      expect(h.api.instantiate).toHaveBeenCalledWith({ id: TEMPLATE, input: { work_item_id: 'w1' } })
    );
    await waitFor(() =>
      expect(Message.error).toHaveBeenCalledWith(
        'conversation.taskBoard.squadStart.errors.squad_worktree_source_invalid (project folder is not a git repository)'
      )
    );
    expect(Message.success).not.toHaveBeenCalled();
    expect(screen.queryByTestId('task-board-worktree')).toBeNull();
    expect(h.core.worktrees).toHaveLength(0);
  });
});
