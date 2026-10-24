/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';

const bridge = vi.hoisted(() => ({
  squads: {
    list: { invoke: vi.fn() },
    preview: { invoke: vi.fn() },
    instantiate: { invoke: vi.fn() },
    create: { invoke: vi.fn() },
    update: { invoke: vi.fn() },
    remove: { invoke: vi.fn() },
  },
  assistants: { list: { invoke: vi.fn() } },
}));
const arco = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn(), confirm: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({ ipcBridge: bridge }));
vi.mock('@renderer/hooks/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
  }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@arco-design/web-react', async (orig) => {
  const actual = await orig<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: { ...actual.Message, error: arco.error, success: arco.success, warning: arco.warning },
    Modal: Object.assign(actual.Modal, { confirm: arco.confirm }),
  };
});

import SquadListPage from '@/renderer/pages/agent-center/squad/SquadListPage';

const brief = (id: string, missing = false) => ({ id, name: missing ? id : `Name ${id}`, enabled: true, missing });
const squad = (over: Record<string, unknown> = {}) => ({
  id: 'sq1',
  name: 'Research',
  description: 'desc',
  leader_assistant_id: 'lead',
  leader_mode: 'route_only',
  members: [{ assistant_id: 'a1', role_title: 'Writer', role_description: '', max_parallel: 1 }],
  visibility: 'private',
  team_id: null,
  created_at: 1,
  updated_at: 5,
  deleted_at: null,
  leader: brief('lead'),
  member_assistants: [brief('a1')],
  ...over,
});
const assistant = (id: string, team_selectable = true) => ({ id, name: `Name ${id}`, team_selectable });

const renderPage = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SquadListPage />
    </SWRConfig>
  );

describe('SquadListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.assistants.list.invoke.mockResolvedValue([assistant('lead'), assistant('a1'), assistant('a2', false)]);
  });

  it('renders cards with leader, member count and missing refs', async () => {
    bridge.squads.list.invoke.mockResolvedValue([squad({ member_assistants: [brief('a1', true)] })]);
    renderPage();
    const card = await screen.findByTestId('squad-card');
    expect(within(card).getByText('Research')).toBeTruthy();
    expect(card.textContent).toContain('agent.agentCenter.squad.leaderLabel:{"name":"Name lead"}');
    expect(card.textContent).toContain('agent.agentCenter.squad.memberCount:{"count":1}');
    expect(within(card).getByTestId('squad-missing')).toBeTruthy();
  });

  it('shows the empty state', async () => {
    bridge.squads.list.invoke.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByTestId('squad-empty')).toBeTruthy();
  });

  it('blocks invalid input client-side without calling the API', async () => {
    bridge.squads.list.invoke.mockResolvedValue([]);
    renderPage();
    await screen.findByTestId('squad-empty');
    fireEvent.click(screen.getByTestId('squad-create'));
    fireEvent.click(await screen.findByTestId('squad-editor-save'));
    expect(arco.error).toHaveBeenCalledWith('agent.agentCenter.squad.errors.squad_invalid_name');
    expect(bridge.squads.create.invoke).not.toHaveBeenCalled();
  });

  it('caps members at 5 besides the leader', async () => {
    bridge.squads.list.invoke.mockResolvedValue([]);
    renderPage();
    await screen.findByTestId('squad-empty');
    fireEvent.click(screen.getByTestId('squad-create'));
    const add = await screen.findByTestId('squad-editor-add-member');
    for (let i = 0; i < 5; i++) fireEvent.click(add);
    expect(screen.getAllByTestId('squad-editor-member')).toHaveLength(5);
    expect((add as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves edits with expected_updated_at and refetches', async () => {
    const s = squad();
    bridge.squads.list.invoke.mockResolvedValue([s]);
    bridge.squads.update.invoke.mockResolvedValue({ ...s, name: 'Research 2', updated_at: 6 });
    renderPage();
    fireEvent.click(await screen.findByTestId('squad-edit'));
    const name = (await screen.findByTestId('squad-editor-name')) as HTMLInputElement;
    expect(name.value).toBe('Research');
    fireEvent.change(name, { target: { value: 'Research 2' } });
    fireEvent.click(screen.getByTestId('squad-editor-save'));
    await waitFor(() => expect(bridge.squads.update.invoke).toHaveBeenCalled());
    const arg = bridge.squads.update.invoke.mock.calls[0][0];
    expect(arg.id).toBe('sq1');
    expect(arg.updates).toMatchObject({ name: 'Research 2', expected_updated_at: 5, leader_assistant_id: 'lead' });
    await waitFor(() => expect(bridge.squads.list.invoke).toHaveBeenCalledTimes(2));
    expect(arco.success).toHaveBeenCalledWith('agent.agentCenter.squad.saved');
  });

  it('handles stale saves by refetching', async () => {
    bridge.squads.list.invoke.mockResolvedValue([squad()]);
    bridge.squads.update.invoke.mockRejectedValue(
      new BackendHttpError({
        method: 'PATCH',
        path: '/api/squads/sq1',
        status: 409,
        body: { success: false, code: 'squad_stale', error: 'squad_stale: changed' },
      })
    );
    renderPage();
    fireEvent.click(await screen.findByTestId('squad-edit'));
    fireEvent.click(await screen.findByTestId('squad-editor-save'));
    await waitFor(() => expect(arco.warning).toHaveBeenCalledWith('agent.agentCenter.squad.errors.squad_stale'));
    await waitFor(() => expect(bridge.squads.list.invoke).toHaveBeenCalledTimes(2));
  });

  it('names the ineligible assistant on 400', async () => {
    bridge.squads.list.invoke.mockResolvedValue([squad()]);
    bridge.squads.update.invoke.mockRejectedValue(
      new BackendHttpError({
        method: 'PATCH',
        path: '/api/squads/sq1',
        status: 400,
        body: {
          success: false,
          code: 'squad_assistant_not_eligible',
          error: 'squad_assistant_not_eligible: a1',
          details: { assistant_id: 'a1' },
        },
      })
    );
    renderPage();
    fireEvent.click(await screen.findByTestId('squad-edit'));
    fireEvent.click(await screen.findByTestId('squad-editor-save'));
    await waitFor(() =>
      expect(arco.error).toHaveBeenCalledWith('agent.agentCenter.squad.ineligibleNamed:{"name":"Name a1"}')
    );
  });

  it('shows the in-use count when delete is refused', async () => {
    bridge.squads.list.invoke.mockResolvedValue([squad()]);
    bridge.squads.remove.invoke.mockRejectedValue(
      new BackendHttpError({
        method: 'DELETE',
        path: '/api/squads/sq1',
        status: 409,
        body: { success: false, code: 'squad_in_use', error: 'squad_in_use', details: { team_ids: ['t1', 't2'] } },
      })
    );
    renderPage();
    fireEvent.click(await screen.findByTestId('squad-delete'));
    expect(arco.confirm).toHaveBeenCalled();
    await arco.confirm.mock.calls[0][0].onOk();
    expect(bridge.squads.remove.invoke).toHaveBeenCalledWith({ id: 'sq1' });
    await waitFor(() => expect(arco.error).toHaveBeenCalledWith('agent.agentCenter.squad.inUseCount:{"count":2}'));
  });

  it('opens the preview drawer from a card', async () => {
    bridge.squads.list.invoke.mockResolvedValue([squad()]);
    bridge.squads.preview.invoke.mockResolvedValue({
      squad_template_id: 'sq1',
      name: 'Research',
      leader_mode: 'route_only',
      participants: [],
      can_instantiate: true,
      blocking: [],
    });
    renderPage();
    fireEvent.click(await screen.findByTestId('squad-preview-open'));
    expect(await screen.findByTestId('squad-preview')).toBeTruthy();
    await waitFor(() => expect(bridge.squads.preview.invoke).toHaveBeenCalledWith({ id: 'sq1' }));
  });
});
