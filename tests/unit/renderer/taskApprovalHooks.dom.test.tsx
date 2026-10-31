/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ listeners: [] as Array<(event: unknown) => void> }));

vi.mock('@/common', () => ({
  ipcBridge: {
    taskSession: {
      approvalChanged: {
        on: (cb: (event: unknown) => void) => {
          mocks.listeners.push(cb);
          return () => {
            const i = mocks.listeners.indexOf(cb);
            if (i >= 0) mocks.listeners.splice(i, 1);
          };
        },
      },
    },
  },
}));

import {
  phoneDecisionForLatestApproval,
  resetTaskApprovalStoreForTests,
  usePhoneApprovalDecisions,
  useTaskApprovalChanged,
} from '@/renderer/hooks/system/inbox/taskApprovalStore';

type Approval = { id: string; status: string; requested_at: number };

/** Mirrors how the task-session card wires the hooks: refresh on change, label from latest approval. */
const Card: React.FC<{ taskId: string; approvals: Approval[]; onRefresh: () => void }> = ({
  taskId,
  approvals,
  onRefresh,
}) => {
  useTaskApprovalChanged(taskId, () => onRefresh());
  usePhoneApprovalDecisions();
  const decision = phoneDecisionForLatestApproval(approvals as never);
  return <span data-testid='label'>{decision ? decision.status : 'none'}</span>;
};

const emit = (over: Record<string, unknown> = {}) =>
  act(() =>
    mocks.listeners.forEach((l) =>
      l({
        task_session_id: 'task-1',
        approval_id: 'ap-1',
        approval_type: 'plan',
        status: 'approved',
        decided_via: 'device',
        device_id: 'dev-1',
        ...over,
      })
    )
  );

describe('task approval hooks', () => {
  beforeEach(() => {
    resetTaskApprovalStoreForTests();
    mocks.listeners.length = 0;
  });

  it('refreshes only the matching task card and labels the phone decision', () => {
    const refresh = vi.fn();
    const other = vi.fn();
    const approvals = [{ id: 'ap-1', status: 'approved', requested_at: 1 }];
    render(
      <>
        <Card taskId='task-1' approvals={approvals} onRefresh={refresh} />
        <Card taskId='task-2' approvals={[]} onRefresh={other} />
      </>
    );
    expect(screen.getAllByTestId('label')[0]).toHaveTextContent('none');
    emit();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('label')[0]).toHaveTextContent('approved');
  });

  it('refreshes but does not claim a phone decision for desktop approvals', () => {
    const refresh = vi.fn();
    render(
      <Card taskId='task-1' approvals={[{ id: 'ap-1', status: 'approved', requested_at: 1 }]} onRefresh={refresh} />
    );
    emit({ decided_via: 'user', device_id: null });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('label')).toHaveTextContent('none');
  });

  it('stops listening after unmount', () => {
    const refresh = vi.fn();
    const view = render(<Card taskId='task-1' approvals={[]} onRefresh={refresh} />);
    view.unmount();
    emit();
    expect(refresh).not.toHaveBeenCalled();
  });
});
