/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners: Array<(event: unknown) => void> = [];
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    inbox: {
      list: { invoke: mocks.list },
      markRead: { invoke: mocks.markRead },
      markAllRead: { invoke: mocks.markAllRead },
      changed: {
        on: (cb: (event: unknown) => void) => {
          listeners.push(cb);
          return () => {
            const i = listeners.indexOf(cb);
            if (i >= 0) listeners.splice(i, 1);
          };
        },
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options ? `${key}:${String(options.count)}` : key,
  }),
}));

import SiderInboxEntry from '@/renderer/components/layout/Sider/SiderNav/SiderInboxEntry';
import { resetInboxStoreForTests } from '@/renderer/hooks/system/inbox/inboxStore';

const item = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  kind: 'failed',
  source_kind: 'conversation',
  source_id: 'conv-1',
  conversation_id: 'conv-1',
  title: 'Refactor billing',
  summary: 'boom',
  created_at: 1,
  read_at: null,
  resolved_at: null,
  ...over,
});

const renderEntry = (onOpenConversation = vi.fn()) =>
  render(
    <SiderInboxEntry
      isMobile={false}
      collapsed={false}
      siderTooltipProps={{} as never}
      onOpenConversation={onOpenConversation}
    />
  );

describe('SiderInboxEntry', () => {
  beforeEach(() => {
    resetInboxStoreForTests();
    listeners.length = 0;
    mocks.list.mockReset();
    mocks.markRead.mockReset();
    mocks.markAllRead.mockReset();
  });

  it('stays hidden when the core has no inbox (404)', async () => {
    mocks.list.mockImplementation(() => Promise.reject(new Error('404')));
    renderEntry();
    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId('sider-inbox-entry')).toBeNull();
  });

  it('shows the unread badge and follows inbox.changed', async () => {
    mocks.list.mockImplementation(() => Promise.resolve({ items: [], unread_count: 3 }));
    renderEntry();
    expect(await screen.findByTestId('sider-inbox-unread')).toHaveTextContent('3');
    act(() => listeners.forEach((l) => l({ unread_count: 120, kind: 'failed' })));
    expect(screen.getByTestId('sider-inbox-unread')).toHaveTextContent('99+');
    act(() => listeners.forEach((l) => l({ unread_count: 0 })));
    expect(screen.queryByTestId('sider-inbox-unread')).toBeNull();
  });

  it('opens the source conversation and marks the item read', async () => {
    mocks.list.mockImplementation(() => Promise.resolve({ items: [item()], unread_count: 1 }));
    mocks.markRead.mockImplementation(() => Promise.resolve({ updated: 1, unread_count: 0 }));
    const onOpen = vi.fn();
    renderEntry(onOpen);
    fireEvent.click(await screen.findByTestId('sider-inbox-entry'));
    fireEvent.click(await screen.findByText('Refactor billing'));
    expect(onOpen).toHaveBeenCalledWith('conv-1');
    await waitFor(() => expect(mocks.markRead).toHaveBeenCalledWith({ id: 'i1' }));
    await waitFor(() => expect(screen.queryByTestId('sider-inbox-unread')).toBeNull());
  });

  it('marks everything read', async () => {
    mocks.list.mockImplementation(() =>
      Promise.resolve({
        items: [item(), item({ id: 'i2', kind: 'approval', title: 'Approval needed' })],
        unread_count: 2,
      })
    );
    mocks.markAllRead.mockImplementation(() => Promise.resolve({ updated: 2, unread_count: 0 }));
    renderEntry();
    fireEvent.click(await screen.findByTestId('sider-inbox-entry'));
    expect(await screen.findAllByTestId('inbox-item')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('inbox-mark-all'));
    await waitFor(() => expect(mocks.markAllRead).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('sider-inbox-unread')).toBeNull());
  });
});
