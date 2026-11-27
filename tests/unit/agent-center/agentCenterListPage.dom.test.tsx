/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  me: vi.fn(),
  preflight: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    agentCenter: {
      list: { invoke: mocks.list },
      run: { invoke: vi.fn() },
      publish: { invoke: vi.fn() },
      unpublish: { invoke: vi.fn() },
    },
    governance: { me: { invoke: mocks.me } },
    agentPreflight: { list: { invoke: mocks.preflight } },
  },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import AgentCenterListPage from '@/renderer/pages/agent-center/AgentCenterListPage';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const item = (id: string, agentId: string) => ({
  assistant: {
    id,
    name: `Agent ${id}`,
    agent_id: agentId,
    agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
    description: 'Helps',
    name_i18n: {},
    description_i18n: {},
  },
  meta: { visibility: 'private', status: 'published', version: 2, skill_refs: [] },
});

describe('agents list (3.0 U4)', () => {
  it('shows cards with the runtime, a preflight badge and a Fix link for a broken runtime', async () => {
    mocks.me.mockResolvedValue({ roles_active: false, role: 'owner' });
    mocks.list.mockResolvedValue([item('a1', 'claude'), item('a2', 'codex')]);
    mocks.preflight.mockResolvedValue([
      { id: 'claude', name: 'Claude', level: 'pass', ready: true, checks: [] },
      {
        id: 'codex',
        name: 'Codex',
        level: 'fail',
        ready: false,
        checks: [{ key: 'auth', level: 'fail', message: 'Log in' }],
      },
    ]);
    render(<AgentCenterListPage />);
    await waitFor(() => expect(screen.getAllByTestId('agent-preflight-badge')).toHaveLength(2));
    expect(screen.getAllByTestId('agent-center-card')).toHaveLength(2);
    const levels = screen.getAllByTestId('agent-preflight-badge').map((el) => el.getAttribute('data-level'));
    expect(levels).toEqual(['pass', 'fail']);
    const fix = screen.getAllByTestId('agent-preflight-fix');
    expect(fix).toHaveLength(1);
    fireEvent.click(fix[0]);
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/agent/codex/repair');
    // Team sharing tab only with roles on.
    expect(screen.queryByText('agent.agentCenter.list.tabs.team')).toBeNull();
  });

  it('offers team sharing when roles are active and hides badges on cores without preflight', async () => {
    mocks.me.mockResolvedValue({ roles_active: true, role: 'admin' });
    mocks.list.mockResolvedValue([item('a1', 'claude')]);
    mocks.preflight.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    render(<AgentCenterListPage />);
    await waitFor(() => expect(screen.getByText('agent.agentCenter.list.tabs.team')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByTestId('agent-center-card')).toHaveLength(1));
    expect(screen.queryByTestId('agent-preflight-badge')).toBeNull();
  });
});
