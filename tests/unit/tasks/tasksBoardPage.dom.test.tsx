import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskSession, TaskSessionStatus } from '@/common/types/agent/taskSession';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: { taskSession: { list: { invoke: mocks.list } } },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('@renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

import TasksBoardPage from '@/renderer/pages/tasks/TasksBoardPage';

const task = (id: string, status: TaskSessionStatus, extra: Partial<TaskSession> = {}): TaskSession => ({
  id,
  title: `Task ${id}`,
  mode: 'agent',
  objective: '',
  acceptance_criteria: [],
  status,
  agent_type: 'claude',
  created_at: 0,
  updated_at: 0,
  ...extra,
});

describe('TasksBoardPage', () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.navigate.mockReset();
  });
  afterEach(() => cleanup());

  it('places task sessions into columns and hides cancelled by default', async () => {
    mocks.list.mockResolvedValue([
      task('r', 'running', { conversation_id: 'conv-r' }),
      task('w', 'waiting_approval'),
      task('c', 'completed'),
      task('d', 'draft'),
      task('f', 'failed'),
      task('rv', 'completed', { board_status: 'in_review' }),
    ]);
    render(<TasksBoardPage />);

    const inProgress = await screen.findByTestId('tasks-board-column-in_progress');
    expect(within(inProgress).getByTestId('task-board-card-r')).toBeTruthy();
    expect(within(inProgress).getByTestId('task-board-card-w')).toBeTruthy();
    expect(
      within(inProgress)
        .getAllByTestId('task-board-card-run-badge')
        .map((n) => n.textContent)
    ).toEqual(expect.arrayContaining(['conversation.taskBoard.run.running', 'conversation.taskBoard.run.blocked']));
    expect(within(screen.getByTestId('tasks-board-column-done')).getByTestId('task-board-card-c')).toBeTruthy();
    expect(within(screen.getByTestId('tasks-board-column-backlog')).getByTestId('task-board-card-d')).toBeTruthy();
    expect(within(screen.getByTestId('tasks-board-column-in_review')).getByTestId('task-board-card-rv')).toBeTruthy();
    expect(screen.queryByTestId('tasks-board-column-cancelled')).toBeNull();
    expect(mocks.list).toHaveBeenCalledWith({});

    fireEvent.click(screen.getByRole('switch'));
    expect(within(screen.getByTestId('tasks-board-column-cancelled')).getByTestId('task-board-card-f')).toBeTruthy();
  });

  it('opens the linked conversation on click and ignores cards without one', async () => {
    mocks.list.mockResolvedValue([task('r', 'running', { conversation_id: 'conv-r' }), task('d', 'draft')]);
    render(<TasksBoardPage />);

    fireEvent.click(await screen.findByTestId('task-board-card-r'));
    expect(mocks.navigate).toHaveBeenCalledWith('/conversation/conv-r');

    fireEvent.click(screen.getByTestId('task-board-card-d'));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it('shows a retry state when loading fails', async () => {
    mocks.list.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([task('d', 'draft')]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<TasksBoardPage />);

    await screen.findByTestId('tasks-board-failed');
    fireEvent.click(screen.getByText('conversation.taskBoard.retry'));
    await waitFor(() => expect(screen.getByTestId('task-board-card-d')).toBeTruthy());
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });
});
