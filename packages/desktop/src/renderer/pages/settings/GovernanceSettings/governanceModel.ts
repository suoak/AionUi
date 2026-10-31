/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TFunction } from 'i18next';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type {
  GovernancePolicyKey,
  GovernanceRole,
  IAuditEvent,
  IAuditQuery,
  IGovernancePolicyEntry,
} from '@/common/types/governance';
import { GOVERNANCE_ROLES } from '@/common/types/governance';

export const AUDIT_PAGE_SIZE = 50;

/** Action families shown in the audit filter (Core action names are `family.verb`). */
export const AUDIT_ACTION_FAMILIES = [
  'config',
  'approval',
  'tool',
  'policy',
  'role',
  'agent_permission',
  'device',
  'skill',
  'conversation',
  'session_message',
  'channel',
] as const;

export const AUDIT_ACTOR_KINDS = ['user', 'agent', 'device', 'system'] as const;
export const BACKEND_NAME_MAX = 64;

/** Switch-style policies, in display order. */
export const BOOLEAN_POLICY_KEYS: readonly GovernancePolicyKey[] = ['no_yolo', 'mcp_strict_only', 'force_sandbox'];

export function findPolicy(
  items: readonly IGovernancePolicyEntry[] | undefined,
  key: GovernancePolicyKey
): IGovernancePolicyEntry | undefined {
  return items?.find((item) => item.key === key);
}

export function policyEnabled(items: readonly IGovernancePolicyEntry[] | undefined, key: GovernancePolicyKey): boolean {
  return findPolicy(items, key)?.value === true;
}

export function policyList(items: readonly IGovernancePolicyEntry[] | undefined, key: GovernancePolicyKey): string[] {
  const value = findPolicy(items, key)?.value;
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export type BackendListResult = { names: string[]; invalid: string[] };

/**
 * Parse the banned-backends editor text. Core matches names lower-cased, so
 * names are trimmed, lower-cased and de-duplicated; separators are commas,
 * whitespace or new lines.
 */
export function parseBackendList(raw: string): BackendListResult {
  const names: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[\s,，、]+/)) {
    const name = part.trim().toLowerCase();
    if (!name) continue;
    if (name.length > BACKEND_NAME_MAX || !/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
      if (!invalid.includes(part.trim())) invalid.push(part.trim());
      continue;
    }
    if (!names.includes(name)) names.push(name);
  }
  return { names, invalid };
}

export function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function isGovernanceRole(value: unknown): value is GovernanceRole {
  return typeof value === 'string' && (GOVERNANCE_ROLES as readonly string[]).includes(value);
}

/** Keep the roles a run permission allows in canonical order; empty means nobody. */
export function normalizeAllowedRoles(roles: readonly string[] | null | undefined): GovernanceRole[] | null {
  if (roles === null || roles === undefined) return null;
  return GOVERNANCE_ROLES.filter((role) => roles.includes(role));
}

export type AuditFilterState = {
  /** Inclusive start / end in epoch ms. */
  from?: number;
  to?: number;
  actionPrefix?: string;
  actorKind?: string;
  actor?: string;
};

export function buildAuditQuery(filter: AuditFilterState, beforeSeq?: number | null): IAuditQuery {
  const query: IAuditQuery = { limit: AUDIT_PAGE_SIZE };
  if (filter.from !== undefined) query.from = filter.from;
  if (filter.to !== undefined) query.to = filter.to;
  const prefix = filter.actionPrefix?.trim();
  if (prefix) query.action_prefix = prefix;
  if (filter.actorKind) query.actor_kind = filter.actorKind;
  const actor = filter.actor?.trim();
  if (actor) query.actor = actor;
  if (beforeSeq !== undefined && beforeSeq !== null) query.before_seq = beforeSeq;
  return query;
}

/** Export uses the same filters without paging. */
export function buildAuditExportQuery(filter: AuditFilterState): IAuditQuery {
  const { limit: _limit, before_seq: _before, ...rest } = buildAuditQuery(filter);
  return rest;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function auditCsvFileName(now: number): string {
  const d = new Date(now);
  return `csbu-workmate-audit-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}.csv`;
}

export function auditActorLabel(event: Pick<IAuditEvent, 'actor_kind' | 'actor_id'>): string {
  return event.actor_id ? `${event.actor_kind}:${event.actor_id}` : event.actor_kind;
}

export function auditTargetLabel(event: Pick<IAuditEvent, 'target_kind' | 'target_id'>): string {
  if (!event.target_kind && !event.target_id) return '';
  if (!event.target_id) return event.target_kind ?? '';
  return event.target_kind ? `${event.target_kind}:${event.target_id}` : event.target_id;
}

/** Pretty-print the (already redacted) diff for the detail view. */
export function formatAuditDiff(diff: unknown): string {
  if (diff === undefined || diff === null) return '';
  if (typeof diff === 'string') {
    try {
      return JSON.stringify(JSON.parse(diff), null, 2);
    } catch {
      return diff;
    }
  }
  return JSON.stringify(diff, null, 2);
}

export type GovernanceAction = 'load' | 'policy' | 'role' | 'permission' | 'audit' | 'verify' | 'export';

export function getGovernanceErrorMessage(error: unknown, t: TFunction, action: GovernanceAction): string {
  const fallback = t(`settings.governance.error.${action}`);
  if (!isBackendHttpError(error)) return fallback;
  if (error.code === 'GOVERNANCE_REQUIRES_USER' || error.code === 'AUDIT_REQUIRES_USER')
    return t('settings.governance.error.requiresUser');
  if (error.code === 'GOVERNANCE_ROLE_REQUIRED' || error.status === 403) {
    return t('settings.governance.error.forbidden');
  }
  if (error.code === 'GOVERNANCE_ROLES_INACTIVE') return t('settings.governance.error.rolesInactive');
  if (error.status === 409) {
    return error.backendMessage ? t('settings.governance.error.conflict', { reason: error.backendMessage }) : fallback;
  }
  if (error.status === 400 && error.backendMessage) {
    return t('settings.governance.error.invalid', { reason: error.backendMessage });
  }
  return fallback;
}
