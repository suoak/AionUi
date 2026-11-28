/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 3.0 C9 / U9: remote approve-to-execute. A paired phone or a bound IM
 * identity answers one exact request (bound to a digest, one-shot, expiring);
 * an approval runs at once on the desktop's Core.
 */
export type ApprovalRequestKind = 'plan' | 'goal' | 'adopt';
export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'invalidated';

export type ApprovalRequest = {
  id: string;
  task_session_id: string;
  kind: ApprovalRequestKind;
  status: ApprovalRequestStatus;
  digest: string;
  approval_id?: string | null;
  artifact_id?: string | null;
  fanout_group_id?: string | null;
  slot?: string | null;
  target_branch?: string | null;
  strategy?: string | null;
  requested_at: number;
  expires_at: number;
  decided_at?: number | null;
  /** `desktop`, `device:<id>` or `im:<platform>:<identity>`. */
  decided_by?: string | null;
  /** superseded | cancelled | expired | diff_changed | task_ended */
  reason?: string | null;
  /** The run id or adopt commit the approval produced. */
  result_ref?: string | null;
  error?: string | null;
};

/** `approval.request.changed` WS payload (a subset of the request). */
export type ApprovalRequestChangedEvent = {
  request_id: string;
  task_session_id: string;
  kind: ApprovalRequestKind;
  status: ApprovalRequestStatus;
  approval_id?: string | null;
  expires_at?: number;
  decided_by?: string | null;
  reason?: string | null;
  result_ref?: string | null;
  error?: string | null;
};

export type RemoteApprovalSettings = { ttl_minutes: number };

export type RemoteApprover = { platform_type: string; platform_user_id: string; created_at: number };

/** Core limits for `ttl_minutes`. */
export const REMOTE_APPROVAL_TTL_DEFAULT = 30;
export const REMOTE_APPROVAL_TTL_MAX = 24 * 60;
