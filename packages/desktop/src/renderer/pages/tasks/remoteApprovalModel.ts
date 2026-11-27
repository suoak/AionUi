/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ApprovalRequest } from '@/common/types/remoteApproval';

/** Where a decision came from, from Core's `decided_by` label. */
export type ApprovalDecider = 'desktop' | 'phone' | 'im';

export const deciderOf = (decidedBy: string | null | undefined): ApprovalDecider | null => {
  if (!decidedBy) return null;
  if (decidedBy === 'desktop') return 'desktop';
  if (decidedBy.startsWith('device:')) return 'phone';
  if (decidedBy.startsWith('im:')) return 'im';
  return null;
};

/** The request shown on a task: the newest one by request time. */
export const latestRequest = (requests: readonly ApprovalRequest[] | null | undefined): ApprovalRequest | null => {
  if (!requests?.length) return null;
  return requests.reduce((a, b) => (b.requested_at > a.requested_at ? b : a));
};

export type RemoteApprovalState =
  | 'waiting'
  | 'approvedRan'
  | 'approvedRunning'
  | 'approvedFailed'
  | 'approvedDesktop'
  | 'rejected'
  | 'expired'
  | 'invalidated';

export type RemoteApprovalView = {
  state: RemoteApprovalState;
  decider: ApprovalDecider | null;
  tone: 'info' | 'success' | 'warning' | 'error';
  /** i18n key for the invalidation reason, when there is one. */
  reasonKey: string | null;
};

const KNOWN_REASONS = new Set(['superseded', 'cancelled', 'expired', 'diff_changed', 'task_ended']);

/**
 * Pure: what the desktop says about one remote request. An approval made on
 * a phone or in IM runs at once, so "approved" splits into ran / still
 * starting / did not run (with Core's error).
 */
export const remoteApprovalView = (request: ApprovalRequest, now: number): RemoteApprovalView => {
  const decider = deciderOf(request.decided_by);
  const reasonKey =
    request.reason && KNOWN_REASONS.has(request.reason)
      ? `conversation.taskBoard.remote.reason.${request.reason}`
      : null;
  switch (request.status) {
    case 'pending':
      return request.expires_at <= now
        ? { state: 'expired', decider, tone: 'warning', reasonKey: null }
        : { state: 'waiting', decider, tone: 'info', reasonKey: null };
    case 'approved':
      if (decider === 'desktop' || decider === null) {
        return { state: 'approvedDesktop', decider, tone: 'success', reasonKey: null };
      }
      if (request.error) return { state: 'approvedFailed', decider, tone: 'error', reasonKey: null };
      if (request.result_ref) return { state: 'approvedRan', decider, tone: 'success', reasonKey: null };
      return { state: 'approvedRunning', decider, tone: 'success', reasonKey: null };
    case 'rejected':
      return { state: 'rejected', decider, tone: 'warning', reasonKey: null };
    case 'expired':
      return { state: 'expired', decider, tone: 'warning', reasonKey: null };
    default:
      return { state: 'invalidated', decider, tone: 'warning', reasonKey };
  }
};

/**
 * True while Core is (or should be) running an approval made remotely, so
 * the desktop must not offer a second manual Execute for it.
 */
export const remoteRunOwnsApproval = (
  requests: readonly ApprovalRequest[] | null | undefined,
  approvalId: string | null | undefined
): boolean => {
  if (!approvalId || !requests?.length) return false;
  return requests.some(
    (r) =>
      r.approval_id === approvalId &&
      r.status === 'approved' &&
      (deciderOf(r.decided_by) === 'phone' || deciderOf(r.decided_by) === 'im') &&
      !r.error
  );
};

/** Minutes left until `expiresAt`, never negative (rounded up). */
export const minutesLeft = (expiresAt: number, now: number): number =>
  Math.max(0, Math.ceil((expiresAt - now) / 60_000));
