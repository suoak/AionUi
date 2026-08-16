/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression test for the agent repair page staying mounted during background
 * catalog revalidation. SWR revalidates the managed-agent catalog when the
 * window regains focus; if the page unmounts its body while `isRefreshing`,
 * unsaved env-var/path edits held in AgentRepairPanel local state are wiped —
 * e.g. a user adds an env row, switches apps to copy the key, and comes back
 * to find the row gone.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({ id: 'agent-1' }),
  };
});

const useManagedAgents = vi.fn();
const prepareManagedAgentRuntimeUntilSettled = vi.fn();
vi.mock('@/renderer/hooks/agent/useManagedAgents', () => ({
  useManagedAgents: () => useManagedAgents(),
  prepareManagedAgentRuntimeUntilSettled: (...args: unknown[]) => prepareManagedAgentRuntimeUntilSettled(...args),
}));

const { messageSuccess, messageError } = vi.hoisted(() => ({
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
}));
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      success: messageSuccess,
      warning: vi.fn(),
      error: messageError,
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      checkManagedAgentHealthById: { invoke: vi.fn() },
    },
  },
}));

// The panel's own behavior is covered by AgentRepairPanel.dom.test.tsx — here
// we only assert whether the page keeps it mounted.
vi.mock('@renderer/pages/settings/AgentSettings/AgentRepairPanel', () => ({
  default: () => <div data-testid='agent-repair-panel-stub' />,
}));
vi.mock('@renderer/pages/settings/AgentSettings/BoundAssistants', () => ({
  BoundAssistantList: () => null,
  getBoundAssistants: () => [],
  useAssistantsForAgents: () => ({ assistants: [] }),
}));

import AgentRepairPage from '@renderer/pages/settings/AgentSettings/AgentRepairPage';
import { ipcBridge } from '@/common';

const agent = {
  id: 'agent-1',
  name: 'Test Agent',
  agent_type: 'acp',
  agent_source: 'custom',
  enabled: true,
  installed: true,
  status: 'online',
};

describe('AgentRepairPage', () => {
  it('keeps the repair panel mounted while the catalog revalidates in the background', () => {
    useManagedAgents.mockReturnValue({ agents: [agent], isRefreshing: true, refreshCatalog: vi.fn() });

    render(<AgentRepairPage />);

    expect(screen.getByTestId('agent-repair-panel-stub')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('navigates back to the agent list when the agent no longer exists after refresh', () => {
    useManagedAgents.mockReturnValue({ agents: [], isRefreshing: false, refreshCatalog: vi.fn() });

    render(<AgentRepairPage />);

    expect(screen.queryByTestId('agent-repair-panel-stub')).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/settings/agent', { replace: true });
  });

  it('shows declared preview limitations for a managed runtime', () => {
    useManagedAgents.mockReturnValue({
      agents: [
        {
          ...agent,
          agent_source_info: { managed_runtime: { runtime_id: 'deepseek-harness', release: '2026.08.14-1' } },
          behavior_policy: { session_lifetime: 'connection_scoped' },
          team_capable: false,
        },
      ],
      isRefreshing: false,
      refreshCatalog: vi.fn(),
    });

    render(<AgentRepairPage />);

    expect(screen.getByText('settings.agentManagement.deepseekHarnessLimitations')).toBeInTheDocument();
  });

  it('installs an uninstalled managed runtime from the repair bar then probes health', async () => {
    const refreshCatalog = vi.fn().mockResolvedValue(undefined);
    const deepSeek = {
      ...agent,
      name: 'DeepSeek Harness',
      agent_source: 'builtin',
      agent_source_info: { managed_runtime: { runtime_id: 'deepseek-harness', release: '2026.08.14-1' } },
      runtime: { runtime_id: 'deepseek-harness', release: '2026.08.14-1', state: 'not_installed' },
      installed: false,
      status: 'missing',
    };
    useManagedAgents.mockReturnValue({ agents: [deepSeek], isRefreshing: false, refreshCatalog });
    prepareManagedAgentRuntimeUntilSettled.mockResolvedValue({
      ...deepSeek,
      runtime: { ...deepSeek.runtime, state: 'ready', phase: 'ready', progress: 100 },
    });
    vi.mocked(ipcBridge.acpConversation.checkManagedAgentHealthById.invoke).mockResolvedValue({
      ...deepSeek,
      status: 'online',
    });

    render(<AgentRepairPage />);

    fireEvent.click(screen.getByText('settings.agentManagement.installAndCheck'));

    await waitFor(() => {
      expect(prepareManagedAgentRuntimeUntilSettled).toHaveBeenCalledWith('agent-1');
    });
    await waitFor(() => {
      expect(ipcBridge.acpConversation.checkManagedAgentHealthById.invoke).toHaveBeenCalledWith({
        id: 'agent-1',
      });
      expect(messageSuccess).toHaveBeenCalledWith('settings.agentManagement.testConnectionOnline');
    });
  });

  it('does not show preview limitations for a vendor-named agent without a managed runtime', () => {
    useManagedAgents.mockReturnValue({
      agents: [{ ...agent, backend: 'deepseek-harness', behavior_policy: { session_lifetime: 'connection_scoped' } }],
      isRefreshing: false,
      refreshCatalog: vi.fn(),
    });

    render(<AgentRepairPage />);

    expect(screen.queryByText('settings.agentManagement.deepseekHarnessLimitations')).toBeNull();
  });
});
