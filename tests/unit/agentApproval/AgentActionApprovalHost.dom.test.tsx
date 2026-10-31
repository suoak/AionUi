/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IAgentApprovalRecord } from '@/common/adapter/ipcBridge';

const mocks = vi.hoisted(() => ({
  listPending: vi.fn(),
  approve: vi.fn(),
  deny: vi.fn(),
  handler: null as ((record: IAgentApprovalRecord) => void) | null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    agentApproval: {
      listPending: { invoke: mocks.listPending },
      approve: { invoke: mocks.approve },
      deny: { invoke: mocks.deny },
      onChanged: {
        on: vi.fn((handler: (record: IAgentApprovalRecord) => void) => {
          mocks.handler = handler;
          return vi.fn();
        }),
      },
    },
  },
}));

import AgentActionApprovalHost from '@/renderer/components/agentApproval/AgentActionApprovalHost';

const pending = (id: string): IAgentApprovalRecord => ({
  id,
  user_id: 'u1',
  conversation_id: 'conv-1',
  kind: 'provider',
  method: 'POST',
  path: '/api/providers',
  summary: '{"base_url":"https://evil.example","api_key":"[REDACTED]"}',
  status: 'pending',
  created_at: Date.now(),
  expires_at: Date.now() + 60_000,
});

describe('AgentActionApprovalHost', () => {
  beforeEach(() => {
    mocks.listPending.mockReset().mockResolvedValue([]);
    mocks.approve.mockReset();
    mocks.deny.mockReset();
    mocks.handler = null;
  });
  afterEach(() => cleanup());

  it('renders nothing without pending approvals', async () => {
    render(<AgentActionApprovalHost />);
    await waitFor(() => expect(mocks.listPending).toHaveBeenCalled());
    expect(screen.queryByTestId('agent-action-approval-approve')).toBeNull();
  });

  it('shows pending approvals fetched on mount and approves the exact id', async () => {
    mocks.listPending.mockResolvedValue([pending('apr_1')]);
    mocks.approve.mockResolvedValue({ ...pending('apr_1'), status: 'approved' });
    render(<AgentActionApprovalHost />);

    const approve = await screen.findByTestId('agent-action-approval-approve');
    expect(screen.getByText(/evil\.example/)).toBeTruthy();
    fireEvent.click(approve);
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith({ id: 'apr_1' }));
    await waitFor(() => expect(screen.queryByTestId('agent-action-approval-approve')).toBeNull());
  });

  it('shows approvals pushed over the event channel and denies them', async () => {
    mocks.deny.mockResolvedValue({ ...pending('apr_2'), status: 'denied' });
    render(<AgentActionApprovalHost />);
    await waitFor(() => expect(mocks.handler).not.toBeNull());

    act(() => mocks.handler?.(pending('apr_2')));
    fireEvent.click(await screen.findByTestId('agent-action-approval-deny'));
    await waitFor(() => expect(mocks.deny).toHaveBeenCalledWith({ id: 'apr_2' }));
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it('closes the card when another window resolves the approval', async () => {
    mocks.listPending.mockResolvedValue([pending('apr_3')]);
    render(<AgentActionApprovalHost />);
    await screen.findByTestId('agent-action-approval-approve');

    act(() => mocks.handler?.({ ...pending('apr_3'), status: 'approved' }));
    await waitFor(() => expect(screen.queryByTestId('agent-action-approval-approve')).toBeNull());
  });

  it('labels an agent work-item proposal (M8 Q9) with its own kind', async () => {
    mocks.listPending.mockResolvedValue([
      {
        ...pending('apr_4'),
        kind: 'work_item',
        path: '/api/task-sessions',
        summary: '{"title":"Follow up flaky test"}',
      },
    ]);
    render(<AgentActionApprovalHost />);
    await screen.findByTestId('agent-action-approval-approve');
    expect(screen.getByText('tools.agentApproval.kind.work_item')).toBeTruthy();
    expect(screen.getByText(/Follow up flaky test/)).toBeTruthy();
  });

  it('every approval kind has a label in every locale', async () => {
    const kinds = ['mcp', 'provider', 'settings', 'agent', 'assistant', 'skill', 'cron', 'squad', 'work_item'];
    const locales = import.meta.glob('@/renderer/services/i18n/locales/*/tools.json', { eager: true }) as Record<
      string,
      { default: { agentApproval: { kind: Record<string, string> } } }
    >;
    expect(Object.keys(locales).length).toBeGreaterThan(1);
    for (const [file, mod] of Object.entries(locales)) {
      for (const kind of kinds) {
        expect(mod.default.agentApproval.kind[kind], `${file} ${kind}`).toBeTruthy();
      }
    }
  });
});
