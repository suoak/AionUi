/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  markRead: vi.fn(),
  setUnread: vi.fn(),
  state: { support: 'supported', unread: 3, revision: 0 },
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options ? `${key}:${String(options.count)}` : key,
  }),
}));
vi.mock('@/common', () => ({ ipcBridge: { inbox: { markRead: { invoke: mocks.markRead } } } }));
vi.mock('@/renderer/hooks/system/inbox/inboxStore', () => ({
  useInboxState: () => mocks.state,
  setInboxUnread: mocks.setUnread,
}));
vi.mock('@/renderer/components/layout/Sider/SiderNav/SiderInboxEntry', () => ({
  InboxPanel: ({ onOpenItem }: { onOpenItem: (item: unknown) => void }) => (
    <div data-testid='inbox-panel'>
      <span
        data-testid='inbox-item'
        onClick={() => onOpenItem({ id: 'i1', kind: 'approval', conversation_id: 'c1', read_at: null })}
      />
    </div>
  ),
}));

import InboxBell from '@/renderer/components/layout/Titlebar/InboxBell';

describe('InboxBell (V3 titlebar)', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.markRead.mockReset().mockResolvedValue({ updated: 1, unread_count: 2 });
    mocks.setUnread.mockReset();
    mocks.state = { support: 'supported', unread: 3, revision: 0 };
  });
  afterEach(cleanup);

  it('renders nothing until Core supports the inbox', () => {
    mocks.state = { support: 'unsupported', unread: 0, revision: 0 };
    render(<InboxBell iconSize={18} />);
    expect(screen.queryByTestId('titlebar-inbox-bell')).toBeNull();
  });

  it('shows the unread badge and caps it at 99+', () => {
    const { rerender } = render(<InboxBell iconSize={18} />);
    expect(screen.getByTestId('titlebar-inbox-unread').textContent).toBe('3');
    mocks.state = { support: 'supported', unread: 120, revision: 1 };
    rerender(<InboxBell iconSize={18} />);
    expect(screen.getByTestId('titlebar-inbox-unread').textContent).toBe('99+');
  });

  it('opens an item: marks it read and navigates to its target', async () => {
    render(<InboxBell iconSize={18} />);
    fireEvent.click(screen.getByTestId('titlebar-inbox-bell'));
    fireEvent.click(await screen.findByTestId('inbox-item'));
    expect(mocks.navigate).toHaveBeenCalledWith('/conversation/c1');
    await waitFor(() => expect(mocks.setUnread).toHaveBeenCalledWith(2));
    expect(mocks.markRead).toHaveBeenCalledWith({ id: 'i1' });
  });
});
