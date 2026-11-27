/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ boardGet: vi.fn(), navigate: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    taskSession: {
      board: {
        get: { invoke: mocks.boardGet },
        updated: { on: () => () => {} },
      },
    },
  },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));

import ConversationTaskPill from '@/renderer/pages/conversation/components/ConversationTaskPill';
import type { TaskSession } from '@/common/types/agent/taskSession';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const task = { id: 'task-1', conversation_id: 'c1', mode: 'plan', status: 'executing' } as unknown as TaskSession;

describe('conversation task pill (3.0 U5)', () => {
  it('shows the lane, the persistent plan bar and links to the task detail', async () => {
    mocks.boardGet.mockResolvedValue({
      columns: [
        {
          board_status: 'in_progress',
          items: [
            {
              id: 'task-1',
              board_status: 'in_progress',
              status: 'executing',
              board_rank: null,
              updated_at: 1,
              latest_plan: { done: 2, total: 5, current: 'Write tests' },
            },
          ],
        },
      ],
    });
    render(<ConversationTaskPill task={task} />);
    await waitFor(() => expect(screen.getByTestId('conversation-task-plan').textContent).toContain('2/5'));
    const pill = screen.getByTestId('conversation-task-pill');
    expect(pill.getAttribute('data-lane')).toBe('in_progress');
    expect(pill.textContent).toContain('conversation.taskBoard.lanes.in_progress');
    fireEvent.click(pill);
    expect(mocks.navigate).toHaveBeenCalledWith('/tasks?task=task-1');
  });

  it('falls back to the session status when the board is unavailable', async () => {
    mocks.boardGet.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    render(<ConversationTaskPill task={task} />);
    await waitFor(() => expect(mocks.boardGet).toHaveBeenCalled());
    expect(screen.getByTestId('conversation-task-pill').textContent).toContain(
      'conversation.taskSession.status.executing'
    );
    expect(screen.queryByTestId('conversation-task-plan')).toBeNull();
  });
});
