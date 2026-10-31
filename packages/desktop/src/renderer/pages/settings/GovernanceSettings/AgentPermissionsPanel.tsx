/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  Empty,
  Input,
  Message,
  Modal,
  Select,
  Switch,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import {
  GOVERNANCE_ROLES,
  type AgentPermissionSubjectKind,
  type GovernanceRole,
  type IAgentPermission,
  type IAgentPermissions,
} from '@/common/types/governance';
import { getGovernanceErrorMessage, normalizeAllowedRoles } from './governanceModel';

export type AssistantOption = { value: string; label: string };

type AgentPermissionsPanelProps = {
  permissions: IAgentPermissions;
  assistants: AssistantOption[];
  canManage: boolean;
  onChanged: (permissions: IAgentPermissions) => void;
};

type Draft = {
  editing: boolean;
  subject_kind: AgentPermissionSubjectKind;
  subject_id: string;
  restricted: boolean;
  roles: GovernanceRole[];
};

const EMPTY_DRAFT: Draft = {
  editing: false,
  subject_kind: 'assistant',
  subject_id: '',
  restricted: true,
  roles: ['owner', 'admin'],
};

/** Which roles may start an assistant or agent type. */
const AgentPermissionsPanel: React.FC<AgentPermissionsPanelProps> = ({
  permissions,
  assistants,
  canManage,
  onChanged,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const assistantNames = useMemo(() => new Map(assistants.map((a) => [a.value, a.label])), [assistants]);

  const subjectLabel = (item: Pick<IAgentPermission, 'subject_kind' | 'subject_id'>) =>
    item.subject_kind === 'assistant' ? (assistantNames.get(item.subject_id) ?? item.subject_id) : item.subject_id;

  const submit = async () => {
    if (!draft) return;
    const subjectId = draft.subject_id.trim();
    if (!subjectId) return;
    setBusy(true);
    try {
      const next = await ipcBridge.governance.setAgentPermission.invoke({
        subject_kind: draft.subject_kind,
        subject_id: subjectId,
        allowed_roles: draft.restricted ? draft.roles : null,
      });
      if (next) onChanged(next);
      Message.success(t('settings.governance.permissions.saved'));
      setDraft(null);
    } catch (err) {
      Message.error(getGovernanceErrorMessage(err, t, 'permission'));
    } finally {
      setBusy(false);
    }
  };

  const rolesLabel = (roles: GovernanceRole[] | null) => {
    if (roles === null) return t('settings.governance.permissions.unrestricted');
    if (roles.length === 0) return t('settings.governance.permissions.nobody');
    return roles.map((role) => t(`settings.governance.role.${role}`)).join(' / ');
  };

  return (
    <div className='flex flex-col gap-8px' data-testid='governance-permissions'>
      <div className='flex items-start gap-12px'>
        <Typography.Text type='secondary' className='text-12px flex-1' data-testid='permissions-hint'>
          {permissions.enforced
            ? t('settings.governance.permissions.hint')
            : t('settings.governance.permissions.notEnforced')}
        </Typography.Text>
        {canManage ? (
          <Button size='small' type='primary' data-testid='permission-add' onClick={() => setDraft({ ...EMPTY_DRAFT })}>
            {t('settings.governance.permissions.add')}
          </Button>
        ) : null}
      </div>
      {permissions.items.length === 0 ? <Empty description={t('settings.governance.permissions.empty')} /> : null}
      {permissions.items.map((item) => {
        const roles = normalizeAllowedRoles(item.allowed_roles);
        return (
          <div
            key={`${item.subject_kind}:${item.subject_id}`}
            data-testid='permission-row'
            data-subject={`${item.subject_kind}:${item.subject_id}`}
            className='rd-12px border border-solid border-[var(--color-border-2)] p-12px flex items-center gap-12px'
          >
            <Tag size='small'>{t(`settings.governance.permissions.kind.${item.subject_kind}`)}</Tag>
            <span className='min-w-0 flex-1 truncate text-14px text-t-primary'>{subjectLabel(item)}</span>
            <span className='text-12px text-t-secondary' data-testid='permission-roles'>
              {rolesLabel(roles)}
            </span>
            {canManage ? (
              <Button
                size='small'
                data-testid='permission-edit'
                onClick={() =>
                  setDraft({
                    editing: true,
                    subject_kind: item.subject_kind === 'agent_type' ? 'agent_type' : 'assistant',
                    subject_id: item.subject_id,
                    restricted: roles !== null,
                    roles: roles ?? ['owner', 'admin'],
                  })
                }
              >
                {t('settings.governance.permissions.edit')}
              </Button>
            ) : null}
          </div>
        );
      })}
      <Modal
        visible={Boolean(draft)}
        title={
          draft?.editing ? t('settings.governance.permissions.editTitle') : t('settings.governance.permissions.add')
        }
        okText={t('settings.governance.save')}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        confirmLoading={busy}
        okButtonProps={{ disabled: !draft?.subject_id.trim(), 'data-testid': 'permission-ok' } as never}
        unmountOnExit
        onOk={() => void submit()}
        onCancel={() => setDraft(null)}
      >
        {draft ? (
          <div className='flex flex-col gap-12px'>
            <div className='flex flex-col gap-4px'>
              <span className='text-12px text-t-secondary'>{t('settings.governance.permissions.kindLabel')}</span>
              <Select
                data-testid='permission-kind'
                value={draft.subject_kind}
                disabled={draft.editing}
                options={(['assistant', 'agent_type'] as const).map((kind) => ({
                  value: kind,
                  label: t(`settings.governance.permissions.kind.${kind}`),
                }))}
                onChange={(value: AgentPermissionSubjectKind) =>
                  setDraft({ ...draft, subject_kind: value, subject_id: '' })
                }
              />
            </div>
            <div className='flex flex-col gap-4px'>
              <span className='text-12px text-t-secondary'>{t('settings.governance.permissions.subjectLabel')}</span>
              {draft.subject_kind === 'assistant' ? (
                <Select
                  data-testid='permission-subject-select'
                  showSearch
                  value={draft.subject_id || undefined}
                  disabled={draft.editing}
                  placeholder={t('settings.governance.permissions.assistantPlaceholder')}
                  options={assistants}
                  onChange={(value: string) => setDraft({ ...draft, subject_id: value })}
                />
              ) : (
                <Input
                  data-testid='permission-subject-input'
                  value={draft.subject_id}
                  disabled={draft.editing}
                  maxLength={128}
                  placeholder={t('settings.governance.permissions.agentTypePlaceholder')}
                  onChange={(value) => setDraft({ ...draft, subject_id: value })}
                />
              )}
            </div>
            <div className='flex items-center gap-8px'>
              <Switch
                data-testid='permission-restricted'
                checked={draft.restricted}
                onChange={(checked: boolean) => setDraft({ ...draft, restricted: checked })}
              />
              <span className='text-14px'>{t('settings.governance.permissions.restrict')}</span>
            </div>
            {draft.restricted ? (
              <Checkbox.Group
                data-testid='permission-roles-group'
                value={draft.roles}
                options={GOVERNANCE_ROLES.map((role) => ({
                  value: role,
                  label: t(`settings.governance.role.${role}`),
                }))}
                onChange={(values: GovernanceRole[]) =>
                  setDraft({ ...draft, roles: normalizeAllowedRoles(values) ?? [] })
                }
              />
            ) : null}
            {draft.restricted && draft.roles.length === 0 ? (
              <div className='text-12px text-[rgb(var(--warning-6))]' data-testid='permission-nobody-warning'>
                {t('settings.governance.permissions.nobodyWarning')}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default AgentPermissionsPanel;
