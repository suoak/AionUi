/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/common/config/storageKeys';
import { createEmptyUsageLedger, writeUsageLedger } from '@/renderer/utils/chat/tokenUsageLedger';

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
    localStorage.removeItem(STORAGE_KEYS.TOKEN_USAGE_LEDGER);
  });

  it('shows an empty state when no usage has been recorded', () => {
    render(<UsagePage />);
    expect(screen.getByTestId('usage-empty-state')).toBeTruthy();
    expect(screen.getByTestId('usage-clear-btn')).toBeDisabled();
    expect(screen.getByTestId('usage-export-btn')).toBeDisabled();
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
    expect(screen.getAllByText('deepseek-harness').length).toBeGreaterThan(0);
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

  it('clears the ledger after confirmation', () => {
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

    expect(screen.getByTestId('usage-empty-state')).toBeTruthy();
  });
});
