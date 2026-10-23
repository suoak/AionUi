/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FanoutCompare, FanoutGroup } from '@/common/types/fanout';

const h = vi.hoisted(() => ({
  compare: vi.fn(),
  diff: vi.fn(),
  list: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fanout: {
      compare: { invoke: h.compare },
      list: { invoke: h.list },
      changed: { on: () => () => {} },
    },
    worktree: { diff: { invoke: h.diff } },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, unknown>) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
  }),
}));

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => h.navigate,
}));

vi.mock('@/renderer/pages/conversation/Preview/components/annotate', () => ({
  AnnotatableDiff: ({ patch, readOnly }: { patch: string; readOnly?: boolean }) => (
    <pre data-testid='annotatable-diff' data-readonly={String(Boolean(readOnly))}>
      {patch}
    </pre>
  ),
}));

import FanoutCompareView from '@/renderer/pages/conversation/fanout/FanoutCompareView';
import FanoutSiderGroup from '@/renderer/components/layout/Sider/FanoutSiderGroup';

const group = {
  id: 'g1',
  status: 'comparing',
  title: 'Fix bug',
  updated_at: 5,
  winner_slot: null,
  slots: [
    { slot: 'A', status: 'finished', worktree_id: 'wt-a' },
    { slot: 'B', status: 'finished', worktree_id: 'wt-b' },
    { slot: 'C', status: 'finished', worktree_id: 'wt-c' },
  ],
} as unknown as FanoutGroup;

const compare = {
  group_id: 'g1',
  slots: ['A', 'B', 'C'].map((slot) => ({
    slot,
    status: 'finished',
    assistant_id: `asst-${slot}`,
    worktree: { id: `wt-${slot.toLowerCase()}` },
    summary: `done ${slot}`,
  })),
  files: [
    {
      path: 'fix.txt',
      slots: {
        A: { status: 'added', additions: 1, deletions: 0 },
        B: { status: 'added', additions: 1, deletions: 0 },
      },
    },
  ],
} as unknown as FanoutCompare;

const wrap = (ui: React.ReactElement) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter>{ui}</MemoryRouter>
    </SWRConfig>
  );

beforeEach(() => {
  h.compare.mockReset().mockResolvedValue(compare);
  h.diff.mockReset();
  h.list.mockReset();
  h.navigate.mockReset();
});

describe('FanoutCompareView file diff', () => {
  it('opens the clicked slot diff of a file with the shared diff component', async () => {
    h.diff.mockResolvedValue({ path: 'fix.txt', binary: false, truncated: false, patch: '--- a\n+++ b\n+fix B' });
    wrap(<FanoutCompareView group={group} assistantName={(id) => id} />);
    fireEvent.click(await screen.findByTestId('fanout-cell-B'));
    await waitFor(() => expect(h.diff).toHaveBeenCalledWith({ id: 'wt-b', path: 'fix.txt' }));
    const diff = await screen.findByTestId('annotatable-diff');
    expect(diff.textContent).toContain('+fix B');
    expect(diff.getAttribute('data-readonly')).toBe('true');
    expect(screen.queryByTestId('fanout-cell-C')).toBeNull();
    fireEvent.click(screen.getByLabelText('conversation.fanout.closeDiff'));
    expect(screen.queryByTestId('fanout-file-diff')).toBeNull();
  });

  it('shows a placeholder for binary files', async () => {
    h.diff.mockResolvedValue({ path: 'fix.txt', binary: true, truncated: false, patch: '' });
    wrap(<FanoutCompareView group={group} assistantName={(id) => id} />);
    fireEvent.click(await screen.findByTestId('fanout-cell-A'));
    expect(await screen.findByText('conversation.fanout.diffBinary')).toBeTruthy();
    expect(screen.queryByTestId('annotatable-diff')).toBeNull();
  });
});

describe('FanoutSiderGroup', () => {
  it('lists groups with their slots and opens the group page', async () => {
    h.list.mockResolvedValue([{ ...group, status: 'adopted', winner_slot: 'B' }]);
    wrap(<FanoutSiderGroup collapsed={false} pathname='/' siderTooltipProps={{}} />);
    const item = await screen.findByTestId('fanout-sider-item-g1');
    expect(item.textContent).toContain('Fix bug');
    expect(screen.getByTestId('fanout-sider-slots').textContent).toBe('A B✓ C');
    fireEvent.click(item);
    expect(h.navigate).toHaveBeenCalledWith('/fanout/g1');
  });

  it('renders nothing when Core has no fan-out API or no groups', async () => {
    h.list.mockRejectedValue(new Error('404'));
    const { container } = wrap(<FanoutSiderGroup collapsed={false} pathname='/' siderTooltipProps={{}} />);
    await waitFor(() => expect(h.list).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="fanout-sider-group"]')).toBeNull();
  });
});
