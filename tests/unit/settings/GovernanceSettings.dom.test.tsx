/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import { BackendHttpError } from '@/common/adapter/httpBridge';

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  policies: vi.fn(),
  setPolicy: vi.fn(),
  roles: vi.fn(),
  setRole: vi.fn(),
  agentPermissions: vi.fn(),
  setAgentPermission: vi.fn(),
  assistants: vi.fn(),
  events: vi.fn(),
  verify: vi.fn(),
  exportCsv: vi.fn(),
  download: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    governance: {
      me: { invoke: mocks.me },
      policies: { invoke: mocks.policies },
      setPolicy: { invoke: mocks.setPolicy },
      roles: { invoke: mocks.roles },
      setRole: { invoke: mocks.setRole },
      agentPermissions: { invoke: mocks.agentPermissions },
      setAgentPermission: { invoke: mocks.setAgentPermission },
    },
    audit: {
      events: { invoke: mocks.events },
      verify: { invoke: mocks.verify },
      exportCsv: { invoke: mocks.exportCsv },
    },
    assistants: { list: { invoke: mocks.assistants } },
  },
}));

vi.mock('@/renderer/utils/file/download', () => ({ downloadTextContent: mocks.download }));

vi.mock('react-i18next', () => {
  const t = (key: string, options?: Record<string, unknown>) => {
    if (!options) return key;
    const { defaultValue: _d, ...rest } = options;
    return Object.keys(rest).length ? `${key}:${JSON.stringify(rest)}` : key;
  };
  const value = { t, i18n: { language: 'en-US' } };
  return { useTranslation: () => value };
});

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { GovernanceSettingsContent } from '@/renderer/pages/settings/GovernanceSettings';

const NOW = new Date(2026, 10, 1, 9, 5).getTime();

const owner = {
  user_id: 'u_owner',
  role: 'owner',
  roles_active: true,
  can_manage_policies: true,
  can_manage_roles: true,
  can_view_all_audit: true,
};
const desktop = { ...owner, user_id: 'system_default_user', roles_active: false };
const member = {
  user_id: 'u_member',
  role: 'member',
  roles_active: true,
  can_manage_policies: false,
  can_manage_roles: false,
  can_view_all_audit: false,
};

const policyItems = (over: Record<string, unknown> = {}) =>
  (
    [
      ['no_yolo', false],
      ['mcp_strict_only', false],
      ['force_sandbox', false],
      ['banned_backends', []],
    ] as Array<[string, unknown]>
  ).map(([key, value]) =>
    key in over ? { key, value: over[key], updated_by: 'u_owner', updated_at: NOW } : { key, value }
  );

const auditEvent = (seq: number, over: Record<string, unknown> = {}) => ({
  seq,
  id: `evt_${seq}`,
  ts: NOW - seq,
  user_id: 'u_owner',
  actor_kind: 'user',
  actor_id: 'u_owner',
  via: 'webui',
  action: 'policy.set',
  target_kind: 'policy',
  target_id: 'no_yolo',
  summary: `event ${seq}`,
  diff: { before: false, after: true },
  prev_hash: 'p',
  hash: `h${seq}`,
  ...over,
});

const policyRow = (key: string) =>
  screen.getAllByTestId('policy-row').find((row) => row.getAttribute('data-policy-key') === key)!;

describe('GovernanceSettings', () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.me.mockResolvedValue(owner);
    mocks.policies.mockResolvedValue({ items: policyItems() });
    mocks.roles.mockResolvedValue({
      roles_active: true,
      items: [
        { user_id: 'u_owner', username: 'lian', role: 'owner', explicit: true },
        { user_id: 'u_member', username: 'bob', role: 'member', explicit: false },
      ],
    });
    mocks.agentPermissions.mockResolvedValue({
      enforced: true,
      items: [
        { subject_kind: 'assistant', subject_id: 'asst_1', allowed_roles: ['admin', 'owner'], updated_at: NOW },
        { subject_kind: 'agent_type', subject_id: 'codex', allowed_roles: [], updated_at: NOW },
      ],
    });
    mocks.assistants.mockResolvedValue([{ id: 'asst_1', name: 'Reviewer' }]);
    mocks.events.mockResolvedValue({ items: [auditEvent(2), auditEvent(1)], next_before_seq: null });
    vi.spyOn(Message, 'success').mockImplementation(() => () => {});
    vi.spyOn(Message, 'error').mockImplementation(() => () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the single-user hint and only policies + audit on the desktop', async () => {
    mocks.me.mockResolvedValue(desktop);
    render(<GovernanceSettingsContent />);
    expect(await screen.findByTestId('governance-single-user')).toBeInTheDocument();
    expect(screen.getByTestId('governance-role')).toHaveTextContent('settings.governance.yourRole');
    expect(screen.getAllByTestId('policy-row')).toHaveLength(4);
    // Desktop owner can still manage policies, so roles/permissions are loaded.
    await waitFor(() => expect(mocks.roles).toHaveBeenCalled());
  });

  it('toggles a switch policy and saves banned backends', async () => {
    mocks.setPolicy.mockImplementation(async ({ key, value }: { key: string; value: unknown }) => ({
      items: policyItems({ [key]: value }),
    }));
    render(<GovernanceSettingsContent />);
    await screen.findAllByTestId('policy-row');
    fireEvent.click(within(policyRow('no_yolo')).getByRole('switch'));
    await waitFor(() => expect(mocks.setPolicy).toHaveBeenCalledWith({ key: 'no_yolo', value: true }));
    await waitFor(() =>
      expect(within(policyRow('no_yolo')).getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    );
    expect(within(policyRow('no_yolo')).getByTestId('policy-updated')).toBeInTheDocument();

    const input = screen.getByTestId('banned-backends-input');
    const save = screen.getByTestId('banned-backends-save');
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Codex, bad/name' } });
    expect(screen.getByTestId('banned-backends-invalid')).toHaveTextContent('bad/name');
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Codex, gemini codex' } });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(mocks.setPolicy).toHaveBeenCalledWith({ key: 'banned_backends', value: ['codex', 'gemini'] })
    );
  });

  it('reports a forbidden policy change', async () => {
    mocks.setPolicy.mockRejectedValue(
      new BackendHttpError({
        method: 'PUT',
        path: '/api/governance/policies/force_sandbox',
        status: 403,
        body: { success: false, error: 'role required', code: 'GOVERNANCE_ROLE_REQUIRED' },
      })
    );
    render(<GovernanceSettingsContent />);
    await screen.findAllByTestId('policy-row');
    fireEvent.click(within(policyRow('force_sandbox')).getByRole('switch'));
    await waitFor(() => expect(Message.error).toHaveBeenCalledWith('settings.governance.error.forbidden'));
  });

  it('keeps a member read-only and hides roles and permissions', async () => {
    mocks.me.mockResolvedValue(member);
    render(<GovernanceSettingsContent />);
    expect(await screen.findByTestId('policies-readonly')).toBeInTheDocument();
    for (const row of screen.getAllByTestId('policy-row').slice(0, 3)) {
      expect(within(row).getByRole('switch')).toBeDisabled();
    }
    expect(screen.getByTestId('banned-backends-input')).toBeDisabled();
    expect(screen.queryByText('settings.governance.tabs.roles')).toBeNull();
    expect(screen.queryByText('settings.governance.tabs.permissions')).toBeNull();
    expect(mocks.roles).not.toHaveBeenCalled();
    expect(mocks.agentPermissions).not.toHaveBeenCalled();
  });

  it('lists users with their roles', async () => {
    render(<GovernanceSettingsContent initialTab='roles' />);
    const rows = await screen.findAllByTestId('role-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('settings.governance.roles.you')).toBeInTheDocument();
    expect(within(rows[1]).getByText('settings.governance.roles.default')).toBeInTheDocument();
    expect(screen.getByTestId('roles-hint')).toHaveTextContent('settings.governance.roles.hintOwner');
  });

  it('shows run permissions with assistant names and role labels', async () => {
    render(<GovernanceSettingsContent initialTab='permissions' />);
    const rows = await screen.findAllByTestId('permission-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Reviewer')).toBeInTheDocument();
    expect(within(rows[0]).getByTestId('permission-roles')).toHaveTextContent(
      'settings.governance.role.owner / settings.governance.role.admin'
    );
    expect(within(rows[1]).getByTestId('permission-roles')).toHaveTextContent('settings.governance.permissions.nobody');
  });

  it('saves an edited run permission as unrestricted', async () => {
    mocks.setAgentPermission.mockResolvedValue({ enforced: true, items: [] });
    render(<GovernanceSettingsContent initialTab='permissions' />);
    const rows = await screen.findAllByTestId('permission-row');
    fireEvent.click(within(rows[1]).getByTestId('permission-edit'));
    expect(await screen.findByTestId('permission-nobody-warning')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('permission-restricted').closest('div')!).getByRole('switch'));
    fireEvent.click(screen.getByText('settings.governance.save'));
    await waitFor(() =>
      expect(mocks.setAgentPermission).toHaveBeenCalledWith({
        subject_kind: 'agent_type',
        subject_id: 'codex',
        allowed_roles: null,
      })
    );
  });

  it('lists audit events, expands details, verifies the chain and exports CSV', async () => {
    mocks.events
      .mockResolvedValueOnce({
        items: [auditEvent(3, { approval_id: 'apr_1', approver_id: 'u_owner' })],
        next_before_seq: 3,
      })
      .mockResolvedValueOnce({ items: [auditEvent(2)], next_before_seq: null });
    mocks.verify.mockResolvedValue({ ok: false, checked: 3, first_broken_seq: 2, head_hash: 'h3' });
    mocks.exportCsv.mockResolvedValue('seq,action\n3,policy.set\n');
    render(<GovernanceSettingsContent initialTab='audit' now={() => NOW} />);

    const first = await screen.findAllByTestId('audit-row');
    expect(first).toHaveLength(1);
    expect(mocks.events).toHaveBeenLastCalledWith({ limit: 50 });
    expect(within(first[0]).getByTestId('audit-approval')).toHaveTextContent('u_owner');
    expect(screen.getByTestId('audit-scope')).toHaveTextContent('settings.governance.audit.scopeAll');

    fireEvent.click(first[0]);
    expect(within(first[0]).getByTestId('audit-detail')).toHaveTextContent('"after": true');

    fireEvent.click(screen.getByTestId('audit-more'));
    await waitFor(() => expect(screen.getAllByTestId('audit-row')).toHaveLength(2));
    expect(mocks.events).toHaveBeenLastCalledWith({ limit: 50, before_seq: 3 });
    expect(screen.queryByTestId('audit-more')).toBeNull();

    fireEvent.click(screen.getByTestId('audit-verify'));
    const status = await screen.findByTestId('audit-chain-status');
    expect(status).toHaveAttribute('data-ok', 'false');
    expect(status).toHaveTextContent('{"seq":2,"count":3}');

    fireEvent.click(screen.getByTestId('audit-export'));
    await waitFor(() =>
      expect(mocks.download).toHaveBeenCalledWith(
        'seq,action\n3,policy.set\n',
        'csbu-workmate-audit-20261101-0905.csv',
        'text/csv;charset=utf-8'
      )
    );
    expect(mocks.exportCsv).toHaveBeenCalledWith({});
  });

  it('tells a member the audit view only covers their own events', async () => {
    mocks.me.mockResolvedValue(member);
    render(<GovernanceSettingsContent initialTab='audit' />);
    expect(await screen.findByTestId('audit-scope')).toHaveTextContent('settings.governance.audit.scopeOwn');
  });

  it('shows a load error when the governance API fails', async () => {
    mocks.me.mockRejectedValue(
      new BackendHttpError({
        method: 'GET',
        path: '/api/governance/me',
        status: 403,
        body: { success: false, error: 'user session required', code: 'GOVERNANCE_REQUIRES_USER' },
      })
    );
    render(<GovernanceSettingsContent />);
    expect(await screen.findByTestId('governance-load-error')).toHaveTextContent(
      'settings.governance.error.requiresUser'
    );
  });
});
