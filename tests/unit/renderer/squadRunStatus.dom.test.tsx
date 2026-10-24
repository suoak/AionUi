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
  team: { list: { invoke: vi.fn() }, getSquadRun: { invoke: vi.fn() } },
}));

vi.mock('@/common', () => ({ ipcBridge: bridge }));
vi.mock('@renderer/hooks/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

import { BackendHttpError } from '@/common/adapter/httpBridge';
import { SquadRunBadge, SquadRunPanel } from '@/renderer/pages/tasks/SquadRunStatus';

const wrap = (node: React.ReactNode) =>
  render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{node}</SWRConfig>);

const payload = (team_id: string, state: string, extra: Record<string, unknown> = {}) => ({
  team_id,
  state,
  leader_conversation_id: null,
  leader_mode: null,
  updated_at: 1000,
  ...extra,
});

describe('SquadRunStatus', () => {
  beforeEach(() => {
    bridge.team.list.invoke.mockReset();
    bridge.team.getSquadRun.invoke.mockReset();
  });

  it('badge shows the most urgent run with a +N count', async () => {
    bridge.team.list.invoke.mockResolvedValue([
      { id: 't1', name: 'A', squad_template_id: 'sq1', updated_at: 1 },
      { id: 't2', name: 'B', squad_template_id: 'sq1', updated_at: 2 },
      { id: 't3', name: 'C', squad_template_id: 'other', updated_at: 3 },
    ]);
    bridge.team.getSquadRun.invoke.mockImplementation(async ({ team_id }: { team_id: string }) =>
      team_id === 't1' ? payload('t1', 'running') : payload('t2', 'finished')
    );
    wrap(<SquadRunBadge templateId='sq1' />);
    const badge = await screen.findByTestId('task-board-card-squad-run');
    expect(badge.getAttribute('data-state')).toBe('running');
    expect(badge.textContent).toContain('conversation.taskBoard.squadRun.state.running');
    expect(badge.textContent).toContain('+1');
    expect(bridge.team.list.invoke).toHaveBeenCalledWith({ user_id: 'u1' });
    expect(bridge.team.getSquadRun.invoke).not.toHaveBeenCalledWith({ team_id: 't3' });
  });

  it('badge renders nothing when no team was instantiated from the squad', async () => {
    bridge.team.list.invoke.mockResolvedValue([{ id: 't9', squad_template_id: 'other' }]);
    const { container } = wrap(<SquadRunBadge templateId='sq1' />);
    await waitFor(() => expect(bridge.team.list.invoke).toHaveBeenCalled());
    expect(container.textContent).toBe('');
    expect(bridge.team.getSquadRun.invoke).not.toHaveBeenCalled();
  });

  it('panel lists each team, idle for null, and opens the leader conversation', async () => {
    bridge.team.list.invoke.mockResolvedValue([
      { id: 't1', name: 'Alpha', squad_template_id: 'sq1', updated_at: 5 },
      { id: 't2', name: 'Beta', squad_template_id: 'sq1', updated_at: 1 },
    ]);
    bridge.team.getSquadRun.invoke.mockImplementation(async ({ team_id }: { team_id: string }) =>
      team_id === 't1'
        ? payload('t1', 'waiting_backlog', { leader_conversation_id: 'conv-1', leader_mode: 'route_only' })
        : null
    );
    const onOpen = vi.fn();
    wrap(<SquadRunPanel templateId='sq1' onOpenConversation={onOpen} />);
    const row = await screen.findByTestId('task-board-squad-run-t1');
    expect(row.textContent).toContain('Alpha');
    expect(row.textContent).toContain('conversation.taskBoard.squadRun.state.waiting_backlog');
    expect(row.textContent).toContain('conversation.taskBoard.squadRun.routeOnly');
    expect(screen.getByTestId('task-board-squad-run-t2').textContent).toContain('conversation.taskBoard.squadRun.idle');
    fireEvent.click(screen.getByTestId('task-board-squad-run-open-t1'));
    expect(onOpen).toHaveBeenCalledWith('conv-1');
  });

  it('panel drops 404 team_not_squad teams and says unavailable when none remain', async () => {
    bridge.team.list.invoke.mockResolvedValue([{ id: 't1', name: 'Alpha', squad_template_id: 'sq1' }]);
    bridge.team.getSquadRun.invoke.mockRejectedValue(
      new BackendHttpError({
        method: 'GET',
        path: '/api/teams/t1/squad-run',
        status: 404,
        body: { code: 'team_not_squad' },
      })
    );
    wrap(<SquadRunPanel templateId='sq1' onOpenConversation={vi.fn()} />);
    await screen.findByTestId('task-board-squad-run-unavailable');
  });

  it('panel explains when the squad has no team yet', async () => {
    bridge.team.list.invoke.mockResolvedValue([]);
    wrap(<SquadRunPanel templateId='sq1' onOpenConversation={vi.fn()} />);
    await screen.findByTestId('task-board-squad-run-no-team');
  });
});
