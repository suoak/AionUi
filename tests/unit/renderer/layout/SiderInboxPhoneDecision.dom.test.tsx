/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  inboxListeners: [] as Array<(event: unknown) => void>,
  approvalListeners: [] as Array<(event: unknown) => void>,
}));

const subscribe = (bucket: Array<(event: unknown) => void>) => (cb: (event: unknown) => void) => {
  bucket.push(cb);
  return () => {
    const i = bucket.indexOf(cb);
    if (i >= 0) bucket.splice(i, 1);
  };
};

vi.mock('@/common', () => ({
  ipcBridge: {
    inbox: {
      list: { invoke: mocks.list },
      markRead: { invoke: vi.fn() },
      markAllRead: { invoke: vi.fn() },
      changed: { on: (cb: (event: unknown) => void) => subscribe(mocks.inboxListeners)(cb) },
    },
    taskSession: {
      approvalChanged: { on: (cb: (event: unknown) => void) => subscribe(mocks.approvalListeners)(cb) },
    },
  },
}));

vi.mock('react-i18next', () => {
  const t = (key: string) => key;
  const value = { t };
  return { useTranslation: () => value };
});

import SiderInboxEntry from '@/renderer/components/layout/Sider/SiderNav/SiderInboxEntry';
import { resetInboxStoreForTests } from '@/renderer/hooks/system/inbox/inboxStore';
import { resetTaskApprovalStoreForTests } from '@/renderer/hooks/system/inbox/taskApprovalStore';

const approvalItem = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  kind: 'approval',
  source_kind: 'conversation',
  source_id: 'conv-1',
  conversation_id: 'conv-1',
  approval_id: 'ap-1',
  title: 'Plan needs approval',
  summary: null,
  created_at: 1,
  read_at: null,
  resolved_at: null,
  ...over,
});

const decision = (over: Record<string, unknown> = {}) => ({
  task_session_id: 'task-1',
  approval_id: 'ap-1',
  approval_type: 'plan',
  status: 'approved',
  decided_via: 'device',
  device_id: 'dev-1',
  ...over,
});

const openPanel = async () => {
  render(
    <SiderInboxEntry isMobile={false} collapsed={false} siderTooltipProps={{} as never} onOpenConversation={vi.fn()} />
  );
  fireEvent.click(await screen.findByTestId('sider-inbox-entry'));
  return screen.findByTestId('inbox-item-status');
};

describe('Inbox phone approval label (E9-3)', () => {
  beforeEach(() => {
    resetInboxStoreForTests();
    resetTaskApprovalStoreForTests();
    mocks.inboxListeners.length = 0;
    mocks.approvalListeners.length = 0;
    mocks.list.mockReset();
    mocks.list.mockImplementation(() => Promise.resolve({ items: [approvalItem()], unread_count: 1 }));
  });

  it('flips a pending approval to "approved on phone" as soon as the WS event lands', async () => {
    const status = await openPanel();
    expect(status).toHaveTextContent('common.inbox.kind.approval');
    expect(status).toHaveAttribute('data-phone', 'false');
    act(() => mocks.approvalListeners.forEach((l) => l(decision())));
    expect(screen.getByTestId('inbox-item-status')).toHaveTextContent('common.inbox.phoneApproved');
    expect(screen.getByTestId('inbox-item-status')).toHaveAttribute('data-phone', 'true');
  });

  it('shows "rejected on phone"', async () => {
    await openPanel();
    act(() => mocks.approvalListeners.forEach((l) => l(decision({ status: 'rejected' }))));
    expect(screen.getByTestId('inbox-item-status')).toHaveTextContent('common.inbox.phoneRejected');
  });

  it('keeps the generic label for desktop decisions and unrelated approvals', async () => {
    mocks.list.mockImplementation(() =>
      Promise.resolve({ items: [approvalItem({ resolved_at: 5 })], unread_count: 0 })
    );
    await openPanel();
    act(() => {
      mocks.approvalListeners.forEach((l) => l(decision({ decided_via: 'user', device_id: null })));
      mocks.approvalListeners.forEach((l) => l(decision({ approval_id: 'ap-other' })));
    });
    const status = screen.getByTestId('inbox-item-status');
    expect(status).toHaveTextContent('common.inbox.resolved');
    expect(status).toHaveAttribute('data-phone', 'false');
  });
});
