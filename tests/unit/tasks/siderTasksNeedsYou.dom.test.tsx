/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ boardGet: vi.fn() }));

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
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => (opts?.count === undefined ? key : `${key}:${opts.count}`),
  }),
}));

import SiderTasksBoardEntry from '@/renderer/components/layout/Sider/SiderNav/SiderTasksBoardEntry';

afterEach(cleanup);

const props = { isMobile: false, isActive: false, collapsed: false, siderTooltipProps: {}, onClick: vi.fn() };

describe('sider Tasks entry needs-you badge (3.0 U2)', () => {
  it('counts tasks in the Needs-you lane', async () => {
    mocks.boardGet.mockResolvedValue({
      columns: [
        {
          board_status: 'todo',
          items: [{ id: 'a', board_status: 'todo', status: 'draft', board_rank: null, updated_at: 1 }],
        },
        {
          board_status: 'in_progress',
          items: [{ id: 'b', board_status: 'in_progress', status: 'failed', board_rank: null, updated_at: 1 }],
        },
        {
          board_status: 'in_review',
          items: [{ id: 'c', board_status: 'in_review', status: 'completed', board_rank: null, updated_at: 1 }],
        },
      ],
    });
    render(<SiderTasksBoardEntry {...props} />);
    await waitFor(() => expect(screen.getByTestId('sider-tasks-needs-you').textContent).toBe('2'));
  });

  it('shows no badge when the board API is missing or nothing needs you', async () => {
    mocks.boardGet.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    render(<SiderTasksBoardEntry {...props} />);
    await waitFor(() => expect(mocks.boardGet).toHaveBeenCalled());
    expect(screen.queryByTestId('sider-tasks-needs-you')).toBeNull();
  });
});
