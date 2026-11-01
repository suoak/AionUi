/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Message, Select, Tag, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import { GOVERNANCE_ROLES, type IGovernanceRoles } from '@/common/types/governance';
import { getGovernanceErrorMessage } from './governanceModel';

type RolesPanelProps = {
  roles: IGovernanceRoles;
  currentUserId: string;
  canManageRoles: boolean;
  onChanged: (roles: IGovernanceRoles) => void;
};

/** Users and their roles (multi-user WebUI mode only). */
const RolesPanel: React.FC<RolesPanelProps> = ({ roles, currentUserId, canManageRoles, onChanged }) => {
  const { t } = useTranslation();
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const editable = roles.roles_active && canManageRoles;

  const change = async (userId: string, role: string) => {
    setBusyUser(userId);
    try {
      const next = await ipcBridge.governance.setRole.invoke({ user_id: userId, role });
      if (next) onChanged(next);
      Message.success(t('settings.governance.roles.saved'));
    } catch (err) {
      Message.error(getGovernanceErrorMessage(err, t, 'role'));
    } finally {
      setBusyUser(null);
    }
  };

  return (
    <div className='flex flex-col gap-8px' data-testid='governance-roles'>
      <Typography.Text type='secondary' className='text-12px' data-testid='roles-hint'>
        {roles.roles_active
          ? canManageRoles
            ? t('settings.governance.roles.hintOwner')
            : t('settings.governance.roles.hintAdmin')
          : t('settings.governance.roles.inactive')}
      </Typography.Text>
      {roles.items.length === 0 ? <Empty description={t('settings.governance.roles.empty')} /> : null}
      {roles.items.map((item) => (
        <div
          key={item.user_id}
          data-testid='role-row'
          data-user-id={item.user_id}
          className='rd-12px border border-solid border-[var(--color-border-2)] p-12px flex items-center gap-12px'
        >
          <div className='min-w-0 flex-1 flex items-center gap-6px'>
            <span className='truncate text-14px text-t-primary'>{item.username || item.user_id}</span>
            {item.user_id === currentUserId ? <Tag size='small'>{t('settings.governance.roles.you')}</Tag> : null}
            {!item.explicit ? (
              <Tag size='small' color='gray'>
                {t('settings.governance.roles.default')}
              </Tag>
            ) : null}
          </div>
          <Select
            size='small'
            className='w-160px'
            data-testid='role-select'
            value={item.role}
            disabled={!editable || busyUser !== null}
            loading={busyUser === item.user_id}
            options={GOVERNANCE_ROLES.map((role) => ({ value: role, label: t(`settings.governance.role.${role}`) }))}
            onChange={(value: string) => {
              if (value !== item.role) void change(item.user_id, value);
            }}
          />
        </div>
      ))}
    </div>
  );
};

export default RolesPanel;
