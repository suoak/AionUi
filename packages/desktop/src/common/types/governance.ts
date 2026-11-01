/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M8 E12 governance and audit wire types (`/api/governance/*`, `/api/audit/*`).
 * Roles only apply in multi-user (WebUI) mode; on the desktop the single user
 * is always `owner`.
 */

export type GovernanceRole = 'owner' | 'admin' | 'member';

export const GOVERNANCE_ROLES: readonly GovernanceRole[] = ['owner', 'admin', 'member'];

export type GovernancePolicyKey = 'no_yolo' | 'mcp_strict_only' | 'banned_backends' | 'force_sandbox';

export const GOVERNANCE_POLICY_KEYS: readonly GovernancePolicyKey[] = [
  'no_yolo',
  'mcp_strict_only',
  'force_sandbox',
  'banned_backends',
];

export interface IGovernanceMe {
  user_id: string;
  role: GovernanceRole | string;
  /** False on the desktop: roles are not enforced and the user is owner. */
  roles_active: boolean;
  can_manage_policies: boolean;
  can_manage_roles: boolean;
  can_view_all_audit: boolean;
}

export interface IGovernancePolicyEntry {
  key: GovernancePolicyKey | string;
  /** `boolean` for switches, `string[]` for `banned_backends`. */
  value: unknown;
  updated_by?: string | null;
  updated_at?: number | null;
}

export interface IGovernancePolicies {
  items: IGovernancePolicyEntry[];
}

export interface IGovernanceUserRole {
  user_id: string;
  username?: string | null;
  role: GovernanceRole | string;
  /** False when the role is the implicit default. */
  explicit: boolean;
  granted_by?: string | null;
  granted_at?: number | null;
}

export interface IGovernanceRoles {
  roles_active: boolean;
  items: IGovernanceUserRole[];
}

export type AgentPermissionSubjectKind = 'assistant' | 'agent_type';

export interface IAgentPermission {
  subject_kind: AgentPermissionSubjectKind | string;
  subject_id: string;
  /** `null` = no restriction. */
  allowed_roles?: string[] | null;
  updated_by?: string | null;
  updated_at: number;
}

export interface IAgentPermissions {
  /** Run permissions are only enforced when roles are active. */
  enforced: boolean;
  items: IAgentPermission[];
}

export interface ISetAgentPermissionInput {
  subject_kind: AgentPermissionSubjectKind;
  subject_id: string;
  allowed_roles: GovernanceRole[] | null;
}

export interface IAuditEvent {
  seq: number;
  id: string;
  ts: number;
  user_id?: string | null;
  actor_kind: string;
  actor_id?: string | null;
  via: string;
  action: string;
  target_kind?: string | null;
  target_id?: string | null;
  summary: string;
  diff?: unknown;
  approver_id?: string | null;
  approval_id?: string | null;
  request_fingerprint?: string | null;
  prev_hash: string;
  hash: string;
}

export interface IAuditEventPage {
  items: IAuditEvent[];
  next_before_seq?: number | null;
}

export interface IAuditQuery {
  from?: number;
  to?: number;
  action?: string;
  action_prefix?: string;
  actor?: string;
  actor_kind?: string;
  user_id?: string;
  before_seq?: number;
  limit?: number;
}

export interface IAuditChainVerification {
  ok: boolean;
  checked: number;
  first_broken_seq?: number | null;
  head_hash?: string | null;
}
