/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  settingsGet: vi.fn(),
  settingsSet: vi.fn(),
  approversList: vi.fn(),
  approversAdd: vi.fn(),
  approversRemove: vi.fn(),
  users: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    remoteApproval: {
      settings: { get: { invoke: mocks.settingsGet }, set: { invoke: mocks.settingsSet } },
      approvers: {
        list: { invoke: mocks.approversList },
        add: { invoke: mocks.approversAdd },
        remove: { invoke: mocks.approversRemove },
      },
    },
    channel: { getAuthorizedUsers: { invoke: mocks.users } },
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts?.where ? `${key}[${String(opts.where)}]` : key),
  }),
}));

import RemoteApprovalCard from '@/renderer/pages/tasks/RemoteApprovalCard';
import RemoteApprovalSection from '@/renderer/pages/settings/DevicesSettings/RemoteApprovalSection';
import type { ApprovalRequest } from '@/common/types/remoteApproval';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const request = (over: Partial<ApprovalRequest>): ApprovalRequest => ({
  id: 'r1',
  task_session_id: 't1',
  kind: 'plan',
  status: 'pending',
  digest: 'd',
  requested_at: 1,
  expires_at: 10 * 60_000,
  ...over,
});

describe('RemoteApprovalCard (3.0 U9)', () => {
  it('says a phone approval ran', () => {
    render(
      <RemoteApprovalCard
        requests={[request({ status: 'approved', decided_by: 'device:p', result_ref: 'run-1' })]}
        now={() => 0}
      />
    );
    expect(screen.getByTestId('task-remote-approval').getAttribute('data-state')).toBe('approvedRan');
    expect(screen.getByTestId('task-remote-approval-status').textContent).toBe(
      'conversation.taskBoard.remote.state.approvedRan[conversation.taskBoard.remote.where.phone]'
    );
  });

  it('shows Core’s error when the remote run did not start', () => {
    render(
      <RemoteApprovalCard
        requests={[request({ status: 'approved', decided_by: 'im:telegram:1', error: 'No model' })]}
        now={() => 0}
      />
    );
    expect(screen.getByTestId('task-remote-approval').getAttribute('data-state')).toBe('approvedFailed');
    expect(screen.getByText('No model')).toBeTruthy();
  });

  it('renders nothing without requests (older cores)', () => {
    const { container } = render(<RemoteApprovalCard requests={null} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('RemoteApprovalSection (3.0 U9)', () => {
  it('saves the request lifetime and lists no approvers yet', async () => {
    mocks.settingsGet.mockResolvedValue({ ttl_minutes: 30 });
    mocks.approversList.mockResolvedValue([]);
    mocks.users.mockResolvedValue([
      { id: 'u1', platformType: 'telegram', platformUserId: '42', display_name: 'Me', authorizedAt: 1 },
    ]);
    mocks.settingsSet.mockResolvedValue({ ttl_minutes: 45 });
    mocks.approversAdd.mockResolvedValue({});
    render(<RemoteApprovalSection />);
    await waitFor(() => expect(screen.getByTestId('remote-approval-settings')).toBeTruthy());
    const ttlNode = screen.getByTestId('remote-approval-ttl');
    const ttlInput = (ttlNode.tagName === 'INPUT' ? ttlNode : ttlNode.querySelector('input')) as HTMLInputElement;
    fireEvent.change(ttlInput, { target: { value: '45' } });
    fireEvent.blur(ttlInput);
    fireEvent.click(screen.getByTestId('remote-approval-ttl-save'));
    await waitFor(() => expect(mocks.settingsSet).toHaveBeenCalledWith({ ttl_minutes: 45 }));
    expect(screen.getByText('settings.devices.remote.noApprovers')).toBeTruthy();
  });

  it('is hidden when Core has no remote approval API', async () => {
    mocks.settingsGet.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    mocks.approversList.mockResolvedValue([]);
    mocks.users.mockResolvedValue([]);
    const { container } = render(<RemoteApprovalSection />);
    await waitFor(() => expect(mocks.settingsGet).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="remote-approval-settings"]')).toBeNull();
  });
});
