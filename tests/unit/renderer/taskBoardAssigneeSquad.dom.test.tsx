/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  squads: { list: { invoke: vi.fn() } },
  taskSession: { board: { update: { invoke: vi.fn() } } },
}));

vi.mock('@/common', () => ({ ipcBridge: bridge }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import TaskBoardAssigneeEditor from '@/renderer/pages/tasks/TaskBoardAssigneeEditor';
import type { TaskBoardItem } from '@/common/types/agent/taskSession';

const item = (assignee: TaskBoardItem['assignee']) =>
  ({ id: 'i1', assignee, updated_at: 1 }) as unknown as TaskBoardItem;

const renderEditor = (assignee: TaskBoardItem['assignee']) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TaskBoardAssigneeEditor item={item(assignee)} onUpdated={vi.fn()} />
    </SWRConfig>
  );

describe('TaskBoardAssigneeEditor squad picker', () => {
  beforeEach(() => {
    bridge.squads.list.invoke.mockReset();
  });

  it('shows a squad select when templates load', async () => {
    bridge.squads.list.invoke.mockResolvedValue([{ id: 'sq1', name: 'Research Squad' }]);
    renderEditor({ kind: 'squad', id: 'sq1' });
    await waitFor(() => expect(screen.getByTestId('task-board-assignee-squad')).toBeTruthy());
    expect(screen.getByText('Research Squad')).toBeTruthy();
    expect(screen.queryByTestId('task-board-assignee-id')).toBeNull();
  });

  it('falls back to the id input when the squad route fails', async () => {
    bridge.squads.list.invoke.mockRejectedValue(new Error('404'));
    renderEditor({ kind: 'squad', id: 'sq1' });
    await waitFor(() => expect(bridge.squads.list.invoke).toHaveBeenCalled());
    expect(screen.getByTestId('task-board-assignee-id')).toBeTruthy();
  });

  it('does not fetch squads for agent assignees', () => {
    renderEditor({ kind: 'agent', id: 'a1' });
    expect(bridge.squads.list.invoke).not.toHaveBeenCalled();
    expect(screen.getByTestId('task-board-assignee-id')).toBeTruthy();
  });
});
