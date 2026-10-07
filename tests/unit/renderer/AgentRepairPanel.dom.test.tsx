/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Message } from '@arco-design/web-react';
import AgentRepairPanel from '@/renderer/pages/settings/AgentSettings/AgentRepairPanel';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import { acpConversation } from '@/common/adapter/ipcBridge';

const openExternalUrlMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/common/adapter/ipcBridge', () => ({
  acpConversation: {
    getAgentOverrides: {
      invoke: vi.fn(),
    },
    setAgentOverrides: {
      invoke: vi.fn(),
    },
    getCodexAccount: { invoke: vi.fn() },
    refreshCodexAccount: { invoke: vi.fn() },
    startCodexLogin: { invoke: vi.fn() },
    cancelCodexLogin: { invoke: vi.fn() },
    logoutCodexAccount: { invoke: vi.fn() },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: (...args: unknown[]) => openExternalUrlMock(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('AgentRepairPanel', () => {
  const mockAgent: ManagedAgent = {
    id: 'test-agent-1',
    name: 'Test Agent',
    agent_type: 'acp',
    agent_source: 'custom',
    command: '/usr/local/bin/test-cli',
    enabled: true,
    installed: true,
    status: 'offline',
    env_override_key_count: 2,
    has_command_override: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    openExternalUrlMock.mockResolvedValue(undefined);
    vi.spyOn(Message, 'success').mockImplementation(() => undefined as never);
  });

  it('loads current overrides on mount without an unlock step', async () => {
    const getMock = vi.mocked(acpConversation.getAgentOverrides.invoke);
    getMock.mockResolvedValue({
      command_override: '/custom/path/cli',
      env_override: [{ name: 'API_KEY', value: 'secret123' }],
    });
    const onSaved = vi.fn();

    render(<AgentRepairPanel agent={mockAgent} onSaved={onSaved} />);

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith({ id: 'test-agent-1' });
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/repair\.pathPlaceholder/)).toHaveValue('/custom/path/cli');
    });
  });

  it('saves overrides then triggers test connection once', async () => {
    const user = userEvent.setup();
    const getMock = vi.mocked(acpConversation.getAgentOverrides.invoke);
    const setMock = vi.mocked(acpConversation.setAgentOverrides.invoke);
    const onSaved = vi.fn();

    getMock.mockResolvedValue({
      command_override: '/custom/path/cli',
      env_override: [
        { name: 'API_KEY', value: 'secret123' },
        { name: 'FACTORY_URL', value: 'http://localhost:8080' },
      ],
    });

    setMock.mockResolvedValue({
      ...mockAgent,
      status: 'online',
      has_command_override: true,
      env_override_key_count: 2,
    });

    render(<AgentRepairPanel agent={mockAgent} onSaved={onSaved} />);

    // Overrides load on mount — wait for the path input to fill.
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith({ id: 'test-agent-1' });
    });
    await waitFor(() => {
      const pathInput = screen.getByPlaceholderText(/repair\.pathPlaceholder/);
      expect(pathInput).toHaveValue('/custom/path/cli');
    });

    // Change path
    const pathInput = screen.getByPlaceholderText(/repair\.pathPlaceholder/);
    await user.clear(pathInput);
    await user.type(pathInput, '/new/path/cli');

    // Save
    const saveButton = screen.getByRole('button', { name: /repair\.saveAndTest/ });
    await user.click(saveButton);

    await waitFor(() => {
      expect(setMock).toHaveBeenCalledWith({
        id: 'test-agent-1',
        command_override: '/new/path/cli',
        env_override: [
          { name: 'API_KEY', value: 'secret123' },
          { name: 'FACTORY_URL', value: 'http://localhost:8080' },
        ],
      });
      expect(Message.success).toHaveBeenCalledWith('settings.agentManagement.testConnectionOnline');
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });

  it('blocks save on duplicate env keys', async () => {
    const user = userEvent.setup();
    const getMock = vi.mocked(acpConversation.getAgentOverrides.invoke);
    const setMock = vi.mocked(acpConversation.setAgentOverrides.invoke);
    const onSaved = vi.fn();

    getMock.mockResolvedValue({
      env_override: [
        { name: 'API_KEY', value: 'secret1' },
        { name: 'API_KEY', value: 'secret2' },
      ],
    });

    render(<AgentRepairPanel agent={mockAgent} onSaved={onSaved} />);

    // Wait for the mount-time load to populate the duplicate env rows.
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith({ id: 'test-agent-1' });
    });

    // Try to save
    const saveButton = screen.getByRole('button', { name: /repair\.saveAndTest/ });
    await user.click(saveButton);

    // Should show error and not call setAgentOverrides
    await waitFor(() => {
      expect(screen.getByText(/repair\.duplicateKeysError/)).toBeInTheDocument();
    });

    expect(setMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('does not save when no override value was entered', async () => {
    const user = userEvent.setup();
    const getMock = vi.mocked(acpConversation.getAgentOverrides.invoke);
    const setMock = vi.mocked(acpConversation.setAgentOverrides.invoke);
    const onSaved = vi.fn();

    getMock.mockResolvedValue({});

    render(<AgentRepairPanel agent={mockAgent} onSaved={onSaved} />);

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith({ id: 'test-agent-1' });
    });

    const saveButton = screen.getByRole('button', { name: /repair\.saveAndTest/ });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/repair\.emptyOverridesError/)).toBeInTheDocument();
    });

    expect(setMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows the offline diagnostic banner and the launch path for an offline agent', async () => {
    vi.mocked(acpConversation.getAgentOverrides.invoke).mockResolvedValue({});

    render(<AgentRepairPanel agent={mockAgent} onSaved={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('settings.repair.offlineTitle')).toBeInTheDocument();
    });
    // Non-online agents expose the launch path as the primary lever.
    expect(screen.getByText('settings.repair.pathLabel')).toBeInTheDocument();
  });

  it('shows the online banner and hides the launch path entirely when online', async () => {
    vi.mocked(acpConversation.getAgentOverrides.invoke).mockResolvedValue({});

    render(<AgentRepairPanel agent={{ ...mockAgent, status: 'online' }} onSaved={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('settings.repair.onlineTitle')).toBeInTheDocument();
    });
    // Online: only environment variables are shown; the launch path is hidden.
    expect(screen.getByText('settings.repair.envLabel')).toBeInTheDocument();
    expect(screen.queryByText('settings.repair.pathLabel')).toBeNull();
  });

  it('does not expose override editing for the internal CSBU WorkMate agent', async () => {
    vi.mocked(acpConversation.getAgentOverrides.invoke).mockResolvedValue({
      command_override: '/bad/path',
      env_override: [{ name: 'ANTHROPIC_API_KEY', value: 'sk-x' }],
    });

    render(
      <AgentRepairPanel
        agent={{
          ...mockAgent,
          id: '632f31d2',
          name: 'CSBU WorkMate',
          agent_type: 'aionrs',
          agent_source: 'internal',
          status: 'online',
        }}
        onSaved={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('settings.repair.onlineTitle')).toBeInTheDocument();
    });

    expect(acpConversation.getAgentOverrides.invoke).not.toHaveBeenCalled();
    expect(screen.queryByText('settings.repair.pathLabel')).toBeNull();
    expect(screen.queryByText('settings.repair.envLabel')).toBeNull();
    expect(screen.queryByRole('button', { name: /repair\.saveAndTest/ })).toBeNull();
  });

  it('starts one managed ChatGPT login and opens only the returned authorization URL', async () => {
    const user = userEvent.setup();
    const codexAgent = { ...mockAgent, backend: 'codex' };
    vi.mocked(acpConversation.getAgentOverrides.invoke).mockResolvedValue({});
    vi.mocked(acpConversation.getCodexAccount.invoke).mockResolvedValue({
      account: {
        auth_state: 'SIGNED_OUT',
        requires_openai_auth: true,
        updated_at: 1,
        generation: 0,
      },
      warnings: [],
      required_version: '0.160.1',
    });
    vi.mocked(acpConversation.startCodexLogin.invoke).mockResolvedValue({
      account: {
        auth_state: 'AUTHENTICATING',
        requires_openai_auth: true,
        updated_at: 2,
        generation: 0,
        active_login: { login_id: 'login-1', started_at: 2, state: 'waiting' },
      },
      authorization_url: 'https://auth.openai.com/codex/example',
    });

    render(<AgentRepairPanel agent={codexAgent} onSaved={vi.fn()} />);

    const login = await screen.findByRole('button', { name: 'codex.account.loginAction' });
    await user.click(login);

    await waitFor(() => {
      expect(acpConversation.startCodexLogin.invoke).toHaveBeenCalledTimes(1);
      expect(openExternalUrlMock).toHaveBeenCalledWith('https://auth.openai.com/codex/example');
    });
  });

  it('rejects a non-HTTPS authorization URL without passing it to the operating system', async () => {
    const user = userEvent.setup();
    vi.mocked(acpConversation.getAgentOverrides.invoke).mockResolvedValue({});
    vi.mocked(acpConversation.getCodexAccount.invoke).mockResolvedValue({
      account: {
        auth_state: 'SIGNED_OUT',
        requires_openai_auth: true,
        updated_at: 1,
        generation: 0,
      },
      warnings: [],
      required_version: '0.160.1',
    });
    vi.mocked(acpConversation.startCodexLogin.invoke).mockResolvedValue({
      account: {
        auth_state: 'AUTHENTICATING',
        requires_openai_auth: true,
        updated_at: 2,
        generation: 0,
      },
      authorization_url: 'file:///unsafe-auth',
    });

    render(<AgentRepairPanel agent={{ ...mockAgent, backend: 'codex' }} onSaved={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'codex.account.loginAction' }));

    expect(await screen.findByText('codex.account.actionError')).toBeInTheDocument();
    expect(openExternalUrlMock).not.toHaveBeenCalled();
  });

  it('shows cancel instead of a duplicate login while authentication is active', async () => {
    vi.mocked(acpConversation.getAgentOverrides.invoke).mockResolvedValue({});
    vi.mocked(acpConversation.getCodexAccount.invoke).mockResolvedValue({
      account: {
        auth_state: 'AUTHENTICATING',
        requires_openai_auth: true,
        updated_at: 1,
        generation: 0,
        active_login: { login_id: 'login-1', started_at: 1, state: 'waiting' },
      },
      warnings: [],
      required_version: '0.160.1',
    });

    render(<AgentRepairPanel agent={{ ...mockAgent, backend: 'codex' }} onSaved={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'codex.account.cancelAction' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'codex.account.loginAction' })).toBeNull();
  });

  it('renders masked signed-in identity, plan and official rate-limit snapshot', async () => {
    vi.mocked(acpConversation.getAgentOverrides.invoke).mockResolvedValue({});
    vi.mocked(acpConversation.getCodexAccount.invoke).mockResolvedValue({
      account: {
        auth_state: 'SIGNED_IN',
        account_type: 'chatgpt',
        email: 'alice@example.com',
        plan_type: 'plus',
        requires_openai_auth: true,
        updated_at: 1,
        generation: 1,
      },
      rate_limits: { rateLimits: { primary: { usedPercent: 12 }, secondary: { usedPercent: 34 } } },
      token_usage: { summary: { lifetimeTokens: 12345 } },
      warnings: [],
      required_version: '0.160.1',
    });

    render(<AgentRepairPanel agent={{ ...mockAgent, backend: 'codex' }} onSaved={vi.fn()} />);

    expect(await screen.findByText('a****@example.com')).toBeInTheDocument();
    expect(screen.getByText('plus')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByText('34%')).toBeInTheDocument();
    expect(screen.getByText('12,345')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'codex.account.logoutAction' })).toBeEnabled();
  });

  it('shows a normalized action error when account refresh fails', async () => {
    const user = userEvent.setup();
    vi.mocked(acpConversation.getAgentOverrides.invoke).mockResolvedValue({});
    vi.mocked(acpConversation.getCodexAccount.invoke).mockResolvedValue({
      account: {
        auth_state: 'SIGNED_OUT',
        requires_openai_auth: true,
        updated_at: 1,
        generation: 0,
      },
      warnings: [],
      required_version: '0.160.1',
    });
    vi.mocked(acpConversation.refreshCodexAccount.invoke).mockRejectedValue(new Error('secret backend detail'));

    render(<AgentRepairPanel agent={{ ...mockAgent, backend: 'codex' }} onSaved={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'codex.account.refreshAction' }));

    expect(await screen.findByText('codex.account.actionError')).toBeInTheDocument();
    expect(screen.queryByText('secret backend detail')).toBeNull();
  });
});
