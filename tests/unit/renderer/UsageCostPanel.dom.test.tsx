/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsageSummaryGroup } from '@/common/adapter/ipcBridge';
import { costCell } from '@/renderer/pages/settings/SystemSettings/UsagePage/usageSummaryModel';

const mocks = vi.hoisted(() => ({ summary: vi.fn() }));

vi.mock('@/common', () => ({ ipcBridge: { usage: { summary: { invoke: mocks.summary } } } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options ? `${key}:${String(options.count)}` : key,
  }),
}));

import UsageCostPanel from '@/renderer/pages/settings/SystemSettings/UsagePage/UsageCostPanel';

const group = (overrides: Partial<UsageSummaryGroup>): UsageSummaryGroup => ({
  key: 'k',
  turns: 1,
  unavailable_turns: 0,
  total_tokens: 100,
  input_tokens: 60,
  output_tokens: 40,
  thought_tokens: 0,
  cached_read_tokens: 0,
  cached_write_tokens: 0,
  cost: null,
  cost_status: 'unavailable',
  ...overrides,
});

const renderPanel = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <UsageCostPanel since={null} locale='en-US' />
    </SWRConfig>
  );

beforeEach(() => {
  mocks.summary.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('costCell', () => {
  it('never turns a missing cost into zero', () => {
    expect(costCell({ cost: null, cost_status: 'unavailable' })).toEqual({ kind: 'unavailable' });
    expect(costCell({ cost: [], cost_status: 'reported' })).toEqual({ kind: 'unavailable' });
  });

  it('keeps currencies apart and flags partial coverage', () => {
    expect(
      costCell({
        cost: [
          { currency: 'USD', amount: 1.5 },
          { currency: 'CNY', amount: 2 },
        ],
        cost_status: 'partial',
      })
    ).toEqual({
      kind: 'amounts',
      amounts: [
        { currency: 'CNY', amount: 2 },
        { currency: 'USD', amount: 1.5 },
      ],
      partial: true,
    });
  });
});

describe('UsageCostPanel', () => {
  it('shows per-currency cost, unavailable cost and unlinked rows', async () => {
    mocks.summary.mockResolvedValue({
      group_by: 'task',
      tz_offset_minutes: 480,
      truncated: false,
      totals: group({
        key: '',
        turns: 3,
        unavailable_turns: 1,
        cost: [
          { currency: 'USD', amount: 1.25 },
          { currency: 'EUR', amount: 0.5 },
        ],
        cost_status: 'partial',
      }),
      groups: [
        group({
          key: 'task-1',
          label: 'Fix login',
          cost: [{ currency: 'USD', amount: 1.25 }],
          cost_status: 'reported',
        }),
        group({ key: '', turns: 2, unavailable_turns: 1 }),
      ],
    });

    renderPanel();

    expect(await screen.findByText('Fix login')).toBeTruthy();
    expect(mocks.summary).toHaveBeenCalledWith(
      expect.objectContaining({ group_by: 'task', limit: 50, tz_offset_minutes: -new Date().getTimezoneOffset() })
    );
    expect(screen.getByText('settings.usage.notTaskLinked')).toBeTruthy();
    // Unreported cost is labelled, not rendered as 0.
    expect(screen.getAllByTestId('usage-cost-unavailable')).toHaveLength(1);
    expect(screen.queryByText(/\$0\.00/)).toBeNull();
    const amounts = screen.getAllByTestId('usage-cost-amount').map((node) => node.textContent);
    expect(amounts.some((text) => text?.includes('€'))).toBe(true);
    expect(amounts.filter((text) => text?.includes('$'))).toHaveLength(2);
    expect(screen.getByText('settings.usage.costPartial')).toBeTruthy();
    expect(screen.getByTestId('usage-unavailable-turns').textContent).toBe('settings.usage.unavailableTurns:1');
  });

  it('switches grouping to weekly reports', async () => {
    mocks.summary.mockResolvedValue({
      group_by: 'task',
      tz_offset_minutes: 0,
      truncated: false,
      totals: group({}),
      groups: [],
    });
    renderPanel();
    await screen.findByTestId('usage-cost-panel');
    await waitFor(() => expect(mocks.summary).toHaveBeenCalled());
    fireEvent.click(screen.getByText('settings.usage.groupBy.week'));
    await waitFor(() => expect(mocks.summary).toHaveBeenLastCalledWith(expect.objectContaining({ group_by: 'week' })));
  });

  it('renders nothing against a core without the summary endpoint', async () => {
    mocks.summary.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    const { container } = renderPanel();
    await waitFor(() => expect(mocks.summary).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('[data-testid="usage-cost-panel"]')).toBeNull());
    expect(container.textContent).toBe('');
  });
});
