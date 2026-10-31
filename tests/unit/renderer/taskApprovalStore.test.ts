/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listeners, on } = vi.hoisted(() => {
  const listeners: Array<(event: unknown) => void> = [];
  const on = vi.fn((cb: (event: unknown) => void) => {
    listeners.push(cb);
    return () => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    };
  });
  return { listeners, on };
});

vi.mock('@/common', () => ({
  ipcBridge: { taskSession: { approvalChanged: { on } } },
}));

import {
  ensureTaskApprovalListener,
  getLatestPhoneDecisionForTask,
  getPhoneDecision,
  phoneDecisionForLatestApproval,
  phoneDecisionFromEvent,
  resetTaskApprovalStoreForTests,
} from '@/renderer/hooks/system/inbox/taskApprovalStore';

const event = (over: Record<string, unknown> = {}) => ({
  task_session_id: 'task-1',
  approval_id: 'ap-1',
  approval_type: 'plan',
  status: 'approved',
  decided_via: 'device',
  device_id: 'dev-1',
  ...over,
});

const emit = (payload: unknown) => listeners.forEach((l) => l(payload));

describe('taskApprovalStore', () => {
  beforeEach(() => {
    resetTaskApprovalStoreForTests();
    listeners.length = 0;
    on.mockClear();
  });

  it('only records decisions Core attributes to a device', () => {
    expect(phoneDecisionFromEvent(event() as never)).toMatchObject({ approval_id: 'ap-1', status: 'approved' });
    expect(phoneDecisionFromEvent(event({ decided_via: 'user' }) as never)).toBeNull();
    // Older cores omit decided_via: never claim a phone decision.
    expect(phoneDecisionFromEvent(event({ decided_via: undefined }) as never)).toBeNull();
    expect(phoneDecisionFromEvent(event({ status: 'pending', decided_via: null }) as never)).toBeNull();
    expect(phoneDecisionFromEvent(event({ status: 'superseded' }) as never)).toBeNull();
  });

  it('attaches one WS listener and remembers phone decisions', () => {
    ensureTaskApprovalListener();
    ensureTaskApprovalListener();
    expect(on).toHaveBeenCalledTimes(1);
    emit(event({ status: 'rejected' }));
    expect(getPhoneDecision('ap-1')).toMatchObject({ status: 'rejected', device_id: 'dev-1' });
    expect(getLatestPhoneDecisionForTask('task-1')?.approval_id).toBe('ap-1');
    expect(getPhoneDecision('other')).toBeUndefined();
  });

  it('shows the label only when it answered the latest approval and Core agrees', () => {
    ensureTaskApprovalListener();
    emit(event({ approval_id: 'ap-1' }));
    const approved = { id: 'ap-1', status: 'approved', requested_at: 10 };
    expect(phoneDecisionForLatestApproval([approved] as never)?.status).toBe('approved');
    // A newer approval (e.g. a resubmitted plan) hides the old phone decision.
    expect(
      phoneDecisionForLatestApproval([approved, { id: 'ap-2', status: 'pending', requested_at: 20 }] as never)
    ).toBeUndefined();
    // Core status disagrees (superseded later): hide.
    expect(phoneDecisionForLatestApproval([{ ...approved, status: 'superseded' }] as never)).toBeUndefined();
    expect(phoneDecisionForLatestApproval(undefined)).toBeUndefined();
  });

  it('survives a bridge without the event (older desktop/core builds)', async () => {
    vi.resetModules();
    vi.doMock('@/common', () => ({ ipcBridge: {} }));
    const store = await import('@/renderer/hooks/system/inbox/taskApprovalStore');
    expect(() => store.ensureTaskApprovalListener()).not.toThrow();
    vi.doUnmock('@/common');
  });
});
