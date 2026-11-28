/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  squads: { list: { invoke: vi.fn() } },
  taskSession: { board: { update: { invoke: vi.fn() } } },
}));

vi.mock('@/common', () => ({ ipcBridge: bridge }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import TaskSquadPicker from '@/renderer/pages/tasks/TaskSquadPicker';
import type { TaskBoardItem } from '@/common/types/agent/taskSession';

const item = (assignee: TaskBoardItem['assignee']) =>
  ({ id: 'i1', assignee, updated_at: 1 }) as unknown as TaskBoardItem;

const renderPicker = (assignee: TaskBoardItem['assignee'], onUpdated = vi.fn()) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TaskSquadPicker item={item(assignee)} onUpdated={onUpdated} />
    </SWRConfig>
  );

describe('TaskSquadPicker (3.0 U8)', () => {
  beforeEach(() => {
    bridge.squads.list.invoke.mockReset();
    bridge.taskSession.board.update.invoke.mockReset();
  });

  it('takes a Squad task back', async () => {
    bridge.squads.list.invoke.mockResolvedValue([{ id: 'sq1', name: 'Research Squad' }]);
    bridge.taskSession.board.update.invoke.mockResolvedValue(item(null));
    const onUpdated = vi.fn();
    renderPicker({ kind: 'squad', id: 'sq1' }, onUpdated);
    fireEvent.click(await screen.findByTestId('task-board-assignee-clear'));
    await waitFor(() =>
      expect(bridge.taskSession.board.update.invoke).toHaveBeenCalledWith({
        id: 'i1',
        updates: { assignee: null, expected_updated_at: 1 },
      })
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });

  it('explains where to make a Squad when there are none, with no free-form id field', async () => {
    bridge.squads.list.invoke.mockResolvedValue([]);
    renderPicker(null);
    expect(await screen.findByTestId('task-squad-none')).toBeTruthy();
    expect(screen.queryByTestId('task-board-assignee-id')).toBeNull();
  });

  it('treats a missing Squad route like no Squads', async () => {
    bridge.squads.list.invoke.mockRejectedValue(new Error('404'));
    renderPicker(null);
    await waitFor(() => expect(bridge.squads.list.invoke).toHaveBeenCalled());
    expect(await screen.findByTestId('task-squad-none')).toBeTruthy();
  });
});
