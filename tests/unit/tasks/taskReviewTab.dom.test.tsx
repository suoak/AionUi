/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import type { TaskBoardItem } from '@/common/types/agent/taskSession';
import type { FanoutGroup } from '@/common/types/fanout';

const mocks = vi.hoisted(() => ({
  fanoutList: vi.fn(),
  deliver: vi.fn(),
  followUp: vi.fn(),
  adoptProps: [] as Array<{ visible: boolean; slot: string | null; defaultStrategy?: string }>,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fanout: { list: { invoke: mocks.fanoutList } },
    taskSession: {
      board: {
        deliver: { invoke: mocks.deliver },
        followUp: { invoke: mocks.followUp },
        review: { invoke: vi.fn() },
      },
    },
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));
vi.mock('@/renderer/pages/conversation/fanout/FanoutCompareView', () => ({
  default: ({ group }: { group: FanoutGroup }) => <div data-testid='compare-stub'>{group.id}</div>,
}));
vi.mock('@/renderer/pages/conversation/fanout/AdoptDialog', () => ({
  default: (props: { visible: boolean; slot: string | null; defaultStrategy?: string }) => {
    mocks.adoptProps.push(props);
    return props.visible ? <div data-testid='adopt-dialog-stub' /> : null;
  },
}));
vi.mock('@/renderer/pages/tasks/TaskBoardReviewPanel', () => ({
  default: () => <div data-testid='review-panel-stub' />,
}));

import TaskReviewTab from '@/renderer/pages/tasks/TaskReviewTab';
import {
  adoptSlotFor,
  parseDelivery,
  parseTab,
  reviewActions,
  reviewGroupFor,
} from '@/renderer/pages/tasks/taskDetailModel';

const item = (overrides: Partial<TaskBoardItem> = {}): TaskBoardItem =>
  ({
    id: 't1',
    title: 'Fix login',
    mode: 'agent',
    status: 'completed',
    board_status: 'in_review',
    priority: 0,
    labels: [],
    board_rank: null,
    created_at: 1,
    updated_at: 2,
    lane: 'needs_you',
    needs_you_reason: 'review',
    ...overrides,
  }) as TaskBoardItem;

const group = (overrides: Partial<FanoutGroup> = {}): FanoutGroup =>
  ({
    id: 'fg1',
    status: 'comparing',
    title: 'Fix login',
    source_repo_path: '/repo',
    base_ref: 'main',
    base_commit: 'abc',
    prompt: 'x',
    max_parallel: 1,
    task_session_id: 't1',
    winner_slot: null,
    slots: [{ slot: 'A', branch: 'task-3f2', worktree_id: 'w', status: 'completed' }],
    created_at: 1,
    updated_at: 5,
    ...overrides,
  }) as FanoutGroup;

beforeEach(() => {
  mocks.adoptProps.length = 0;
  mocks.fanoutList.mockResolvedValue([group()]);
  vi.spyOn(Message, 'success').mockImplementation(() => () => {});
  vi.spyOn(Message, 'error').mockImplementation(() => () => {});
  vi.spyOn(Message, 'info').mockImplementation(() => () => {});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('taskDetailModel', () => {
  it('parses only well-formed delivery parts', () => {
    expect(parseDelivery({ delivery: undefined })).toEqual({});
    expect(
      parseDelivery({
        delivery: { pull_request: { url: 'https://x/pull/3', number: 3 }, adopt: { nope: 1 }, issue_comment: 'bad' },
      })
    ).toEqual({ pull_request: { url: 'https://x/pull/3', number: 3 } });
  });

  it('picks the newest live group and its winner slot', () => {
    const old = group({ id: 'old', updated_at: 1 });
    const gone = group({ id: 'gone', status: 'discarded', updated_at: 9 });
    const fresh = group({ id: 'new', updated_at: 7, winner_slot: 'B' });
    expect(reviewGroupFor([old, gone, fresh])?.id).toBe('new');
    expect(reviewGroupFor([gone])).toBeNull();
    expect(adoptSlotFor(fresh)).toBe('B');
    expect(adoptSlotFor(old)).toBe('A');
  });

  it('offers no actions while running or once done', () => {
    expect(reviewActions(item({ status: 'running' }), group())).toEqual({
      adopt: false,
      openPr: false,
      updatePr: false,
      requestChanges: false,
    });
    expect(reviewActions(item({ board_status: 'done', lane: 'done' }), group())).toMatchObject({
      adopt: false,
      openPr: true,
      requestChanges: false,
    });
    expect(reviewActions(item({ board_status: 'in_progress', status: 'failed' }), group()).openPr).toBe(false);
    expect(reviewActions(item(), group({ status: 'adopted' })).adopt).toBe(false);
    expect(reviewActions(item({ delivery: { pull_request: { url: 'u' } } }), group())).toMatchObject({
      openPr: false,
      updatePr: true,
    });
    expect(parseTab('review')).toBe('review');
    expect(parseTab('nope')).toBe('overview');
  });
});

describe('TaskReviewTab', () => {
  it('shows the diff and Adopt opens the adopt dialog on squash (D4)', async () => {
    render(<TaskReviewTab item={item()} interactive />);
    expect(await screen.findByTestId('compare-stub')).toBeTruthy();
    expect(screen.getByTestId('review-panel-stub')).toBeTruthy();
    fireEvent.click(screen.getByTestId('task-review-adopt'));
    expect(screen.getByTestId('adopt-dialog-stub')).toBeTruthy();
    expect(mocks.adoptProps.at(-1)).toMatchObject({ visible: true, slot: 'A', defaultStrategy: 'squash' });
  });

  it('opens a PR through Core deliver', async () => {
    const onItemUpdated = vi.fn();
    mocks.deliver.mockResolvedValue(item({ delivery: { pull_request: { url: 'https://gh/pull/9', number: 9 } } }));
    render(<TaskReviewTab item={item()} interactive onItemUpdated={onItemUpdated} />);
    fireEvent.click(await screen.findByTestId('task-review-open-pr'));
    fireEvent.click(screen.getByTestId('task-review-pr-draft').querySelector('input')!);
    fireEvent.click(
      screen.getByText('conversation.taskBoard.review3.openPr', { selector: '.arco-modal-footer button span' })
    );
    await waitFor(() =>
      expect(mocks.deliver).toHaveBeenCalledWith({
        id: 't1',
        kind: 'pr',
        title: 'Fix login',
        body: undefined,
        draft: true,
      })
    );
    expect(onItemUpdated).toHaveBeenCalled();
  });

  it('Request changes sends a follow-up to the same conversation', async () => {
    const onChanged = vi.fn();
    mocks.followUp.mockResolvedValue({
      state: 'started',
      item: item({ board_status: 'in_progress', lane: 'in_progress' }),
    });
    render(<TaskReviewTab item={item()} interactive onChanged={onChanged} />);
    fireEvent.click(await screen.findByTestId('task-review-request-changes'));
    fireEvent.change(screen.getByTestId('task-review-changes-text'), { target: { value: 'Add a test' } });
    fireEvent.click(
      screen.getByText('conversation.taskBoard.review3.sendChanges', { selector: '.arco-modal-footer button span' })
    );
    await waitFor(() => expect(mocks.followUp).toHaveBeenCalledWith({ id: 't1', text: 'Add a test' }));
    expect(onChanged).toHaveBeenCalled();
  });

  it('explains an adopt conflict and links the open PR', async () => {
    render(
      <TaskReviewTab
        item={item({
          needs_you_reason: 'merge_conflict',
          delivery: {
            adopt: { status: 'conflict', message: 'CONFLICT in src/a.ts' },
            pull_request: { url: 'https://gh/pull/9', number: 9 },
          },
        })}
        interactive
      />
    );
    expect((await screen.findByTestId('task-review-conflict')).textContent).toContain('CONFLICT in src/a.ts');
    expect(screen.getByTestId('task-review-pr').querySelector('a')?.getAttribute('href')).toBe('https://gh/pull/9');
    expect(screen.queryByTestId('task-review-open-pr')).toBeNull();
    expect(screen.getByTestId('task-review-update-pr')).toBeTruthy();
  });

  it('says there is nothing to review when the task has no changes', async () => {
    mocks.fanoutList.mockResolvedValue([]);
    render(<TaskReviewTab item={item()} interactive />);
    expect(await screen.findByTestId('task-review-empty')).toBeTruthy();
    expect(screen.queryByTestId('task-review-adopt')).toBeNull();
  });
});
