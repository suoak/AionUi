/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import {
  AUDIT_PAGE_SIZE,
  auditActorLabel,
  auditCsvFileName,
  auditTargetLabel,
  buildAuditExportQuery,
  buildAuditQuery,
  formatAuditDiff,
  getGovernanceErrorMessage,
  isGovernanceRole,
  normalizeAllowedRoles,
  parseBackendList,
  policyEnabled,
  policyList,
  sameList,
} from '@/renderer/pages/settings/GovernanceSettings/governanceModel';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key) as unknown as Parameters<typeof getGovernanceErrorMessage>[1];

const httpError = (status: number, message: string, code?: string) =>
  new BackendHttpError({
    method: 'PUT',
    path: '/api/governance/policies/no_yolo',
    status,
    body: { success: false, error: message, code },
  });

describe('governanceModel policies', () => {
  const items = [
    { key: 'no_yolo', value: true },
    { key: 'mcp_strict_only', value: false },
    { key: 'banned_backends', value: ['codex', 3, 'gemini'] },
  ];

  it('reads switch policies, treating missing or non-boolean values as off', () => {
    expect(policyEnabled(items, 'no_yolo')).toBe(true);
    expect(policyEnabled(items, 'mcp_strict_only')).toBe(false);
    expect(policyEnabled(items, 'force_sandbox')).toBe(false);
    expect(policyEnabled(undefined, 'no_yolo')).toBe(false);
    expect(policyEnabled([{ key: 'no_yolo', value: 'true' }], 'no_yolo')).toBe(false);
  });

  it('reads list policies, keeping only strings', () => {
    expect(policyList(items, 'banned_backends')).toEqual(['codex', 'gemini']);
    expect(policyList([], 'banned_backends')).toEqual([]);
    expect(policyList([{ key: 'banned_backends', value: null }], 'banned_backends')).toEqual([]);
  });

  it('parses the banned-backends text: lower-cased, de-duplicated, invalid names reported', () => {
    expect(parseBackendList(' Codex, gemini\nCODEX，qwen-code 、 open.ai_1 ')).toEqual({
      names: ['codex', 'gemini', 'qwen-code', 'open.ai_1'],
      invalid: [],
    });
    expect(parseBackendList('claude, bad/name, -dash, bad/name')).toEqual({
      names: ['claude'],
      invalid: ['bad/name', '-dash'],
    });
    expect(parseBackendList('a'.repeat(65)).invalid).toHaveLength(1);
    expect(parseBackendList('   ')).toEqual({ names: [], invalid: [] });
  });

  it('compares lists in order', () => {
    expect(sameList(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameList(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameList([], ['a'])).toBe(false);
  });
});

describe('governanceModel roles and permissions', () => {
  it('recognizes the three roles only', () => {
    expect(isGovernanceRole('owner')).toBe(true);
    expect(isGovernanceRole('member')).toBe(true);
    expect(isGovernanceRole('root')).toBe(false);
    expect(isGovernanceRole(undefined)).toBe(false);
  });

  it('normalizes allowed roles into canonical order; null means unrestricted, empty means nobody', () => {
    expect(normalizeAllowedRoles(null)).toBeNull();
    expect(normalizeAllowedRoles(undefined)).toBeNull();
    expect(normalizeAllowedRoles([])).toEqual([]);
    expect(normalizeAllowedRoles(['member', 'bogus', 'owner'])).toEqual(['owner', 'member']);
  });
});

describe('governanceModel audit helpers', () => {
  it('builds paged queries from trimmed filters', () => {
    expect(buildAuditQuery({})).toEqual({ limit: AUDIT_PAGE_SIZE });
    expect(
      buildAuditQuery({ from: 1, to: 2, actionPrefix: ' policy. ', actorKind: 'user', actor: '  u_1 ' }, 99)
    ).toEqual({
      limit: AUDIT_PAGE_SIZE,
      from: 1,
      to: 2,
      action_prefix: 'policy.',
      actor_kind: 'user',
      actor: 'u_1',
      before_seq: 99,
    });
    expect(buildAuditQuery({ actionPrefix: '  ', actor: '' }, null)).toEqual({ limit: AUDIT_PAGE_SIZE });
  });

  it('drops paging from the export query', () => {
    expect(buildAuditExportQuery({ actionPrefix: 'tool.', from: 5 })).toEqual({ action_prefix: 'tool.', from: 5 });
  });

  it('names the CSV with the brand and local time', () => {
    const now = new Date(2026, 10, 1, 9, 5).getTime();
    expect(auditCsvFileName(now)).toBe('csbu-workmate-audit-20261101-0905.csv');
  });

  it('labels actors and targets', () => {
    expect(auditActorLabel({ actor_kind: 'user', actor_id: 'u_1' })).toBe('user:u_1');
    expect(auditActorLabel({ actor_kind: 'system', actor_id: null })).toBe('system');
    expect(auditTargetLabel({ target_kind: 'policy', target_id: 'no_yolo' })).toBe('policy:no_yolo');
    expect(auditTargetLabel({ target_kind: 'policy', target_id: null })).toBe('policy');
    expect(auditTargetLabel({ target_kind: null, target_id: 'x' })).toBe('x');
    expect(auditTargetLabel({ target_kind: null, target_id: null })).toBe('');
  });

  it('pretty-prints diffs given as objects or JSON strings', () => {
    expect(formatAuditDiff(null)).toBe('');
    expect(formatAuditDiff({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatAuditDiff('{"b":2}')).toBe('{\n  "b": 2\n}');
    expect(formatAuditDiff('not json')).toBe('not json');
  });
});

describe('getGovernanceErrorMessage', () => {
  it('maps Core governance error codes', () => {
    expect(getGovernanceErrorMessage(httpError(403, 'x', 'GOVERNANCE_REQUIRES_USER'), t, 'policy')).toBe(
      'settings.governance.error.requiresUser'
    );
    expect(getGovernanceErrorMessage(httpError(403, 'x', 'GOVERNANCE_ROLE_REQUIRED'), t, 'policy')).toBe(
      'settings.governance.error.forbidden'
    );
    expect(getGovernanceErrorMessage(httpError(403, 'x', 'AUDIT_SCOPE_FORBIDDEN'), t, 'audit')).toBe(
      'settings.governance.error.forbidden'
    );
    expect(getGovernanceErrorMessage(httpError(409, 'x', 'GOVERNANCE_ROLES_INACTIVE'), t, 'role')).toBe(
      'settings.governance.error.rolesInactive'
    );
  });

  it('surfaces backend reasons for conflicts and bad input, else falls back per action', () => {
    expect(getGovernanceErrorMessage(httpError(409, 'last owner'), t, 'role')).toBe(
      'settings.governance.error.conflict:{"reason":"last owner"}'
    );
    expect(getGovernanceErrorMessage(httpError(400, 'unknown key'), t, 'policy')).toBe(
      'settings.governance.error.invalid:{"reason":"unknown key"}'
    );
    expect(getGovernanceErrorMessage(httpError(500, 'boom'), t, 'export')).toBe('settings.governance.error.export');
    expect(getGovernanceErrorMessage(new Error('net'), t, 'load')).toBe('settings.governance.error.load');
  });
});
