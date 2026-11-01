/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Spin, Tabs, Tag } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type {
  IAgentPermissions,
  IGovernanceMe,
  IGovernancePolicyEntry,
  IGovernanceRoles,
} from '@/common/types/governance';
import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import AgentPermissionsPanel, { type AssistantOption } from './AgentPermissionsPanel';
import AuditPanel from './AuditPanel';
import EncryptionRootHint from './EncryptionRootHint';
import PoliciesPanel from './PoliciesPanel';
import RolesPanel from './RolesPanel';
import { getGovernanceErrorMessage } from './governanceModel';

export type GovernanceTab = 'policies' | 'roles' | 'permissions' | 'audit';

type GovernanceSettingsContentProps = {
  initialTab?: GovernanceTab;
  now?: () => number;
};

/** Governance: launch policies, roles, agent run permissions and the audit ledger. */
export const GovernanceSettingsContent: React.FC<GovernanceSettingsContentProps> = ({ initialTab, now }) => {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const [tab, setTab] = useState<GovernanceTab>(initialTab ?? 'policies');
  const [me, setMe] = useState<IGovernanceMe | null>(null);
  const [policies, setPolicies] = useState<IGovernancePolicyEntry[]>([]);
  const [roles, setRoles] = useState<IGovernanceRoles | null>(null);
  const [permissions, setPermissions] = useState<IAgentPermissions | null>(null);
  const [assistants, setAssistants] = useState<AssistantOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [who, policyView] = await Promise.all([
        ipcBridge.governance.me.invoke(),
        ipcBridge.governance.policies.invoke(),
      ]);
      setMe(who);
      setPolicies(policyView?.items ?? []);
      setLoadError(null);
      if (who?.can_manage_policies) {
        const [roleView, permissionView, assistantList] = await Promise.all([
          ipcBridge.governance.roles.invoke(),
          ipcBridge.governance.agentPermissions.invoke(),
          ipcBridge.assistants.list.invoke().catch((): [] => []),
        ]);
        setRoles(roleView);
        setPermissions(permissionView);
        setAssistants((assistantList ?? []).map((a) => ({ value: a.id, label: a.name || a.id })));
      }
    } catch (err) {
      setLoadError(getGovernanceErrorMessage(err, tRef.current, 'load'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const manager = Boolean(me?.can_manage_policies);

  return (
    <div className='flex flex-col gap-16px' data-testid='governance-settings'>
      <SettingsPageHeader
        title={t('settings.governance.title')}
        description={t('settings.governance.description')}
        actions={
          me ? (
            <Tag data-testid='governance-role' color={me.role === 'member' ? 'gray' : 'arcoblue'}>
              {t('settings.governance.yourRole', {
                role: t(`settings.governance.role.${me.role}`, { defaultValue: me.role }),
              })}
            </Tag>
          ) : null
        }
      />
      {loadError ? <Alert type='error' data-testid='governance-load-error' content={loadError} /> : null}
      {me && !me.roles_active ? (
        <Alert type='info' data-testid='governance-single-user' content={t('settings.governance.singleUser')} />
      ) : null}
      <EncryptionRootHint />
      {!me && !loadError ? <Spin className='self-center' /> : null}
      {me ? (
        <Tabs activeTab={tab} onChange={(key) => setTab(key as GovernanceTab)} data-testid='governance-tabs'>
          <Tabs.TabPane key='policies' title={t('settings.governance.tabs.policies')}>
            <PoliciesPanel items={policies} canManage={manager} onChanged={setPolicies} />
          </Tabs.TabPane>
          {manager && roles ? (
            <Tabs.TabPane key='roles' title={t('settings.governance.tabs.roles')}>
              <RolesPanel
                roles={roles}
                currentUserId={me.user_id}
                canManageRoles={me.can_manage_roles}
                onChanged={setRoles}
              />
            </Tabs.TabPane>
          ) : null}
          {manager && permissions ? (
            <Tabs.TabPane key='permissions' title={t('settings.governance.tabs.permissions')}>
              <AgentPermissionsPanel
                permissions={permissions}
                assistants={assistants}
                canManage={manager}
                onChanged={setPermissions}
              />
            </Tabs.TabPane>
          ) : null}
          <Tabs.TabPane key='audit' title={t('settings.governance.tabs.audit')}>
            <AuditPanel canViewAll={me.can_view_all_audit} now={now} />
          </Tabs.TabPane>
        </Tabs>
      ) : null}
    </div>
  );
};

const GovernanceSettings: React.FC = () => (
  <SettingsPageWrapper>
    <GovernanceSettingsContent />
  </SettingsPageWrapper>
);

export default GovernanceSettings;
