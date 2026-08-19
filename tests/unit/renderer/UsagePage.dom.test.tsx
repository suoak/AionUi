/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/common/config/storageKeys';
import { createEmptyUsageLedger, writeUsageLedger } from '@/renderer/utils/chat/tokenUsageLedger';
import { ipcBridge } from '@/common';
import { Message } from '@arco-design/web-react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options && typeof options === 'object') {
        return Object.entries(options)
          .filter(([name]) => name !== 'defaultValue')
          .reduce((acc, [name, value]) => acc.replaceAll(`{{${name}}}`, String(value)), key);
      }
      return key;
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getUserConversations: { invoke: vi.fn().mockResolvedValue({ items: [] }) },
    },
    usage: {
      list: { invoke: vi.fn().mockRejectedValue(new Error('offline')) },
      clear: { invoke: vi.fn().mockResolvedValue(0) },
    },
    conversation: {
      responseStream: { on: vi.fn(() => vi.fn()) },
    },
  },
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-page-wrapper'>{children}</div>,
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  };
});

vi.mock('@/renderer/components/base/WorkMateModal', () => ({
  default: ({
    visible,
    children,
    footer,
  }: {
    visible: boolean;
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    visible ? (
      <div data-testid='usage-clear-modal'>
        {children}
        {footer}
      </div>
    ) : null,
}));

import UsagePage from '@/renderer/pages/settings/SystemSettings/UsagePage';

describe('UsagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(STORAGE_KEYS.TOKEN_USAGE_LEDGER);
    vi.mocked(ipcBridge.usage.list.invoke).mockRejectedValue(new Error('offline'));
    vi.mocked(ipcBridge.usage.clear.invoke).mockResolvedValue(0);
    vi.mocked(ipcBridge.database.getUserConversations.invoke).mockResolvedValue({
      items: [],
      total: 0,
      has_more: false,
    });
  });

  it('shows an empty state when no usage has been recorded', () => {
    render(<UsagePage />);
    expect(screen.getByTestId('usage-empty-state')).toBeTruthy();
    expect(screen.getByTestId('usage-clear-btn')).toBeDisabled();
    expect(screen.getByTestId('usage-export-btn')).toBeDisabled();
  });

  it('scans every conversation page for historical usage once', async () => {
    vi.mocked(ipcBridge.database.getUserConversations.invoke)
      .mockResolvedValueOnce({
        items: [{ id: 'cursor-1', type: 'acp', name: 'First', created_at: 1, extra: {} }],
        total: 2,
        has_more: true,
      })
      .mockResolvedValueOnce({
        items: [{ id: 'cursor-2', type: 'acp', name: 'Second', created_at: 2, extra: {} }],
        total: 2,
        has_more: false,
      });

    render(<UsagePage />);

    await waitFor(() => {
      expect(ipcBridge.database.getUserConversations.invoke).toHaveBeenNthCalledWith(2, {
        cursor: 'cursor-1',
        limit: 100,
      });
    });
  });

  it('renders totals, trend, and agent breakdown from the local ledger', () => {
    writeUsageLedger({
      ...createEmptyUsageLedger(),
      events: [
        {
          id: 'e1',
          recorded_at: Date.now(),
          conversation_id: 'conv-1',
          fingerprint: 'turn:1',
          backend: 'deepseek-harness',
          assistant_id: 'asst-1',
          assistant_name: 'DeepSeek Preview',
          conversation_name: 'Harness preview chat',
          model_id: 'deepseek-chat',
          input_tokens: 1200,
          output_tokens: 300,
          thought_tokens: 0,
          cached_read_tokens: 0,
          cached_write_tokens: 0,
          cost_delta: 0.12,
          cost_currency: 'USD',
          source: 'acp',
        },
      ],
    });

    render(<UsagePage />);

    expect(screen.queryByTestId('usage-empty-state')).toBeNull();
    expect(screen.getByTestId('usage-trend-chart')).toBeTruthy();
    expect(screen.getAllByTestId('usage-breakdown-row').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Retired runtime').length).toBeGreaterThan(0);
    expect(screen.getByText('DeepSeek Preview')).toBeTruthy();
    expect(screen.getByText('Harness preview chat')).toBeTruthy();
    expect(screen.getByTestId('usage-model-filter')).toBeTruthy();
    fireEvent.click(screen.getByTestId('usage-model-filter-deepseek-chat'));
    expect(screen.getByText('Harness preview chat')).toBeTruthy();
  });

  it('scopes the model breakdown to the selected model while keeping all filter chips', () => {
    writeUsageLedger({
      ...createEmptyUsageLedger(),
      events: [
        {
          id: 'e1',
          recorded_at: Date.now(),
          conversation_id: 'conv-1',
          fingerprint: 'turn:1',
          backend: 'deepseek-harness',
          assistant_name: 'DeepSeek Preview',
          conversation_name: 'Harness preview chat',
          model_id: 'deepseek-chat',
          input_tokens: 1200,
          output_tokens: 300,
          thought_tokens: 0,
          cached_read_tokens: 0,
          cached_write_tokens: 0,
          cost_delta: 0,
          source: 'acp',
        },
        {
          id: 'e2',
          recorded_at: Date.now(),
          conversation_id: 'conv-2',
          fingerprint: 'turn:2',
          backend: 'gemini',
          assistant_name: 'Gemini',
          conversation_name: 'Gemini chat',
          model_id: 'gemini-2.5-pro',
          input_tokens: 400,
          output_tokens: 100,
          thought_tokens: 0,
          cached_read_tokens: 0,
          cached_write_tokens: 0,
          cost_delta: 0,
          source: 'acp',
        },
      ],
    });

    render(<UsagePage />);

    expect(screen.getByTestId('usage-model-filter-deepseek-chat')).toBeTruthy();
    expect(screen.getByTestId('usage-model-filter-gemini-2.5-pro')).toBeTruthy();
    expect(screen.getByText('Harness preview chat')).toBeTruthy();
    expect(screen.getByText('Gemini chat')).toBeTruthy();

    fireEvent.click(screen.getByTestId('usage-model-filter-deepseek-chat'));

    expect(screen.getByText('Harness preview chat')).toBeTruthy();
    expect(screen.queryByText('Gemini chat')).toBeNull();
    expect(screen.queryByText('Gemini')).toBeNull();
    expect(screen.getByTestId('usage-model-filter-gemini-2.5-pro')).toBeTruthy();
    expect(screen.getAllByText('deepseek-chat').length).toBeGreaterThan(0);
    expect(screen.queryByText('gemini-2.5-pro')).toBeNull();
  });

  it('clears the ledger after backend confirmation', async () => {
    writeUsageLedger({
      ...createEmptyUsageLedger(),
      events: [
        {
          id: 'e1',
          recorded_at: Date.now(),
          conversation_id: 'conv-1',
          fingerprint: 'turn:1',
          backend: 'aionrs',
          input_tokens: 10,
          output_tokens: 4,
          thought_tokens: 0,
          cached_read_tokens: 0,
          cached_write_tokens: 0,
          cost_delta: 0,
          source: 'aionrs',
        },
      ],
    });

    render(<UsagePage />);
    fireEvent.click(screen.getByTestId('usage-clear-btn'));
    fireEvent.click(screen.getByTestId('usage-clear-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('usage-empty-state')).toBeTruthy();
      expect(Message.success).toHaveBeenCalledWith('settings.usage.clearSuccess');
    });
  });

  it('reports a backend clear failure instead of showing false success', async () => {
    vi.mocked(ipcBridge.usage.clear.invoke).mockRejectedValueOnce(new Error('offline'));
    writeUsageLedger({
      ...createEmptyUsageLedger(),
      events: [
        {
          id: 'e1',
          recorded_at: Date.now(),
          conversation_id: 'conv-1',
          fingerprint: 'turn:1',
          backend: 'aionrs',
          input_tokens: 10,
          output_tokens: 4,
          thought_tokens: 0,
          cached_read_tokens: 0,
          cached_write_tokens: 0,
          cost_delta: 0,
          source: 'aionrs',
        },
      ],
    });

    render(<UsagePage />);
    fireEvent.click(screen.getByTestId('usage-clear-btn'));
    fireEvent.click(screen.getByTestId('usage-clear-confirm'));

    await waitFor(() => {
      expect(Message.error).toHaveBeenCalledWith('common.deleteFailed');
    });
    expect(Message.success).not.toHaveBeenCalledWith('settings.usage.clearSuccess');
  });

  it('keeps local records when the backend ledger is empty', async () => {
    vi.mocked(ipcBridge.usage.list.invoke).mockResolvedValue({ events: [] });
    writeUsageLedger({
      ...createEmptyUsageLedger(),
      events: [
        {
          id: 'e1',
          recorded_at: Date.now(),
          conversation_id: 'conv-1',
          fingerprint: 'turn:1',
          backend: 'grok',
          conversation_name: 'Grok chat',
          model_id: 'grok-4.6-build',
          input_tokens: 14675,
          output_tokens: 119,
          thought_tokens: 77,
          cached_read_tokens: 11648,
          cached_write_tokens: 0,
          cost_delta: 0.002,
          cost_currency: 'USD',
          source: 'acp',
        },
      ],
    });

    render(<UsagePage />);

    await waitFor(() => {
      expect(screen.queryByTestId('usage-empty-state')).toBeNull();
    });
    expect(screen.getByText('Grok chat')).toBeTruthy();
    expect(screen.getAllByText('grok').length).toBeGreaterThan(0);
  });

  it('keeps local-only protocol records when the backend ledger is partially populated', async () => {
    vi.mocked(ipcBridge.usage.list.invoke).mockResolvedValue({
      events: [
        {
          id: 'backend-1',
          recorded_at: Date.now(),
          conversation_id: 'conv-backend',
          conversation_source: 'aionui',
          backend: 'claude',
          model_id: 'claude-sonnet',
          input_tokens: 100,
          output_tokens: 20,
          thought_tokens: 0,
          cached_read_tokens: 0,
          cached_write_tokens: 0,
          cost_delta: 0,
          event_source: 'acp',
        },
      ],
    });
    writeUsageLedger({
      ...createEmptyUsageLedger(),
      events: [
        {
          id: 'local-1',
          recorded_at: Date.now(),
          conversation_id: 'conv-local',
          fingerprint: 'turn:local',
          backend: 'grok',
          conversation_name: 'Local Grok chat',
          model_id: 'grok-4.6-build',
          input_tokens: 70,
          output_tokens: 10,
          thought_tokens: 0,
          cached_read_tokens: 0,
          cached_write_tokens: 0,
          cost_delta: 0,
          source: 'acp',
        },
      ],
    });

    render(<UsagePage />);

    await waitFor(() => {
      expect(screen.getByText('Local Grok chat')).toBeTruthy();
    });
    expect(screen.getAllByText('claude').length).toBeGreaterThan(0);
  });
});
