/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';

const bridge = vi.hoisted(() => ({
  squads: { preview: { invoke: vi.fn() }, instantiate: { invoke: vi.fn() } },
}));
const arco = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
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
  return { ...actual, Message: { ...actual.Message, error: arco.error, success: arco.success } };
});

import SquadPreviewDrawer from '@/renderer/pages/agent-center/squad/SquadPreviewDrawer';

const brief = (id: string) => ({ id, name: `Name ${id}`, enabled: true, missing: false });
const participant = (over: Record<string, unknown> = {}) => ({
  assistant_id: 'a1',
  agent_name: 'Writer',
  role: 'teammate',
  role_title: 'Writer',
  role_description: 'writes',
  max_parallel: 2,
  assistant: brief('a1'),
  backend: 'claude',
  eligible: true,
  subagent_spawn: 'forbidden',
  ...over,
});
const preview = (over: Record<string, unknown> = {}) => ({
  squad_template_id: 'sq1',
  name: 'Research',
  leader_mode: 'route_only',
  participants: [
    participant({
      assistant_id: 'lead',
      agent_name: 'Leader',
      role: 'lead',
      assistant: brief('lead'),
      team_tools: ['team_send_message', 'team_task_list'],
    }),
    participant(),
  ],
  can_instantiate: true,
  blocking: [],
  ...over,
});
const squad = { id: 'sq1', name: 'Research' } as never;

const renderDrawer = (onClose = vi.fn()) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SquadPreviewDrawer visible squad={squad} onClose={onClose} />
    </SWRConfig>
  );

describe('SquadPreviewDrawer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists participants leader-first with route_only tools and fixed-roster notice', async () => {
    bridge.squads.preview.invoke.mockResolvedValue(preview());
    renderDrawer();
    const rows = await screen.findAllByTestId('squad-preview-participant');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('agent.agentCenter.squad.preview.role.lead');
    expect(rows[0].textContent).toContain('team_send_message, team_task_list');
    expect(rows[1].textContent).toContain('agent.agentCenter.squad.preview.role.teammate');
    expect(rows[1].querySelector('[data-testid="squad-preview-tools"]')).toBeNull();
    expect(document.body.textContent).toContain('agent.agentCenter.squad.preview.fixedRoster');
    expect(bridge.squads.preview.invoke).toHaveBeenCalledWith({ id: 'sq1' });
  });

  it('shows blockers and disables instantiate when not instantiable', async () => {
    bridge.squads.preview.invoke.mockResolvedValue(
      preview({
        can_instantiate: false,
        participants: [participant({ eligible: false })],
        blocking: [{ code: 'squad_assistant_not_eligible', assistant_id: 'a1' }, { code: 'weird' }],
      })
    );
    renderDrawer();
    const blockers = await screen.findByTestId('squad-preview-blockers');
    expect(blockers.textContent).toContain(
      'agent.agentCenter.squad.preview.blockers.squad_assistant_not_eligible:{"name":"Name a1"}'
    );
    expect(blockers.textContent).toContain('agent.agentCenter.squad.preview.blockers.generic');
    expect(screen.getByTestId('squad-preview-ineligible')).toBeTruthy();
    expect((screen.getByTestId('squad-instantiate') as HTMLButtonElement).disabled).toBe(true);
  });

  it('instantiates with a custom name and navigates to the new team', async () => {
    bridge.squads.preview.invoke.mockResolvedValue(preview());
    bridge.squads.instantiate.invoke.mockResolvedValue({ squad_template_id: 'sq1', team: { id: 't9', name: 'R2' } });
    const onClose = vi.fn();
    renderDrawer(onClose);
    await screen.findAllByTestId('squad-preview-participant');
    const input = screen.getByTestId('squad-preview-team-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'R2' } });
    fireEvent.click(screen.getByTestId('squad-instantiate'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/team/t9'));
    expect(bridge.squads.instantiate.invoke).toHaveBeenCalledWith({ id: 'sq1', input: { name: 'R2' } });
    expect(onClose).toHaveBeenCalled();
    expect(arco.success).toHaveBeenCalled();
  });

  it('keeps default name out of the body and maps 503 errors', async () => {
    bridge.squads.preview.invoke.mockResolvedValue(preview());
    bridge.squads.instantiate.invoke.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/squads/sq1/instantiate',
        status: 503,
        body: {
          success: false,
          error: 'squad_instantiate_unavailable: no provisioner',
          code: 'squad_instantiate_unavailable',
        },
      })
    );
    renderDrawer();
    await screen.findAllByTestId('squad-preview-participant');
    fireEvent.click(screen.getByTestId('squad-instantiate'));
    await waitFor(() =>
      expect(arco.error).toHaveBeenCalledWith('agent.agentCenter.squad.errors.squad_instantiate_unavailable')
    );
    expect(bridge.squads.instantiate.invoke).toHaveBeenCalledWith({ id: 'sq1', input: {} });
    expect(navigate).not.toHaveBeenCalled();
  });
});
