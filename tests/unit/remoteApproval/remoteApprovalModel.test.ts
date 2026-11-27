/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { ApprovalRequest } from '@/common/types/remoteApproval';
import {
  deciderOf,
  latestRequest,
  minutesLeft,
  remoteApprovalView,
  remoteRunOwnsApproval,
} from '@/renderer/pages/tasks/remoteApprovalModel';

const req = (over: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  id: 'r1',
  task_session_id: 't1',
  kind: 'plan',
  status: 'pending',
  digest: 'd',
  approval_id: 'ap1',
  requested_at: 1_000,
  expires_at: 1_000 + 30 * 60_000,
  ...over,
});

describe('remote approval model (3.0 U9)', () => {
  it('reads who decided from Core labels', () => {
    expect(deciderOf('desktop')).toBe('desktop');
    expect(deciderOf('device:abc')).toBe('phone');
    expect(deciderOf('im:telegram:42')).toBe('im');
    expect(deciderOf(null)).toBeNull();
    expect(deciderOf('other')).toBeNull();
  });

  it('picks the newest request', () => {
    expect(latestRequest([req({ id: 'a', requested_at: 5 }), req({ id: 'b', requested_at: 9 })])?.id).toBe('b');
    expect(latestRequest([])).toBeNull();
  });

  it('describes waiting, expiry and voided requests', () => {
    expect(remoteApprovalView(req(), 2_000).state).toBe('waiting');
    // A pending row past its expiry reads as expired before Core sweeps it.
    expect(remoteApprovalView(req(), 1_000 + 31 * 60_000).state).toBe('expired');
    const voided = remoteApprovalView(req({ status: 'invalidated', reason: 'diff_changed' }), 0);
    expect(voided).toMatchObject({
      state: 'invalidated',
      reasonKey: 'conversation.taskBoard.remote.reason.diff_changed',
    });
    expect(remoteApprovalView(req({ status: 'invalidated', reason: 'weird' }), 0).reasonKey).toBeNull();
  });

  it('splits remote approvals into ran, starting and failed', () => {
    const base = { status: 'approved' as const, decided_by: 'device:p1' };
    expect(remoteApprovalView(req({ ...base, result_ref: 'run-1' }), 0)).toMatchObject({
      state: 'approvedRan',
      decider: 'phone',
      tone: 'success',
    });
    expect(remoteApprovalView(req(base), 0).state).toBe('approvedRunning');
    expect(remoteApprovalView(req({ ...base, decided_by: 'im:slack:u', error: 'boom' }), 0)).toMatchObject({
      state: 'approvedFailed',
      decider: 'im',
      tone: 'error',
    });
    expect(remoteApprovalView(req({ status: 'approved', decided_by: 'desktop' }), 0).state).toBe('approvedDesktop');
    expect(remoteApprovalView(req({ status: 'rejected', decided_by: 'im:x:y' }), 0)).toMatchObject({
      state: 'rejected',
      decider: 'im',
    });
  });

  it('lets Core own the run for a remote approval unless it failed', () => {
    const approved = req({ status: 'approved', decided_by: 'device:p1' });
    expect(remoteRunOwnsApproval([approved], 'ap1')).toBe(true);
    expect(remoteRunOwnsApproval([{ ...approved, error: 'x' }], 'ap1')).toBe(false);
    expect(remoteRunOwnsApproval([{ ...approved, decided_by: 'desktop' }], 'ap1')).toBe(false);
    expect(remoteRunOwnsApproval([approved], 'other')).toBe(false);
    expect(remoteRunOwnsApproval(null, 'ap1')).toBe(false);
  });

  it('rounds minutes left up and never below zero', () => {
    expect(minutesLeft(61_000, 0)).toBe(2);
    expect(minutesLeft(0, 5_000)).toBe(0);
  });
});
