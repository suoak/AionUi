/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Message, Switch, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { GovernancePolicyKey, IGovernancePolicyEntry } from '@/common/types/governance';
import { formatDateTime } from '@/renderer/services/i18n/format';
import {
  BOOLEAN_POLICY_KEYS,
  findPolicy,
  getGovernanceErrorMessage,
  parseBackendList,
  policyEnabled,
  policyList,
  sameList,
} from './governanceModel';

type PoliciesPanelProps = {
  items: IGovernancePolicyEntry[];
  canManage: boolean;
  onChanged: (items: IGovernancePolicyEntry[]) => void;
};

const UpdatedHint: React.FC<{ entry?: IGovernancePolicyEntry }> = ({ entry }) => {
  const { t, i18n } = useTranslation();
  if (!entry?.updated_at) return null;
  return (
    <Typography.Text type='secondary' className='text-12px' data-testid='policy-updated'>
      {t('settings.governance.policies.updated', {
        time: formatDateTime(entry.updated_at, i18n.language),
        user: entry.updated_by ?? '-',
      })}
    </Typography.Text>
  );
};

/** The four launch policies (all off by default). */
const PoliciesPanel: React.FC<PoliciesPanelProps> = ({ items, canManage, onChanged }) => {
  const { t } = useTranslation();
  const [busyKey, setBusyKey] = useState<GovernancePolicyKey | null>(null);
  const savedBackends = policyList(items, 'banned_backends');
  const [backendDraft, setBackendDraft] = useState(savedBackends.join(', '));
  const savedKey = savedBackends.join(',');

  useEffect(() => {
    setBackendDraft(savedKey.split(',').filter(Boolean).join(', '));
  }, [savedKey]);

  const save = async (key: GovernancePolicyKey, value: unknown) => {
    setBusyKey(key);
    try {
      const next = await ipcBridge.governance.setPolicy.invoke({ key, value });
      onChanged(next?.items ?? items);
      Message.success(t('settings.governance.policies.saved'));
    } catch (err) {
      Message.error(getGovernanceErrorMessage(err, t, 'policy'));
    } finally {
      setBusyKey(null);
    }
  };

  const parsed = parseBackendList(backendDraft);
  const backendsDirty = !sameList(parsed.names, savedBackends);

  return (
    <div className='flex flex-col gap-8px' data-testid='governance-policies'>
      {!canManage ? (
        <Typography.Text type='secondary' className='text-12px' data-testid='policies-readonly'>
          {t('settings.governance.policies.readOnly')}
        </Typography.Text>
      ) : null}
      {BOOLEAN_POLICY_KEYS.map((key) => (
        <div
          key={key}
          data-testid='policy-row'
          data-policy-key={key}
          className='rd-12px border border-solid border-[var(--color-border-2)] p-12px flex items-start gap-12px'
        >
          <div className='min-w-0 flex-1 flex flex-col gap-2px'>
            <span className='text-14px font-[500] text-t-primary'>
              {t(`settings.governance.policies.${key}.title`)}
            </span>
            <Typography.Text type='secondary' className='text-12px'>
              {t(`settings.governance.policies.${key}.description`)}
            </Typography.Text>
            <UpdatedHint entry={findPolicy(items, key)} />
          </div>
          <Switch
            data-testid={`policy-switch-${key}`}
            checked={policyEnabled(items, key)}
            loading={busyKey === key}
            disabled={!canManage || busyKey !== null}
            onChange={(checked: boolean) => void save(key, checked)}
          />
        </div>
      ))}
      <div
        data-testid='policy-row'
        data-policy-key='banned_backends'
        className='rd-12px border border-solid border-[var(--color-border-2)] p-12px flex flex-col gap-8px'
      >
        <div className='flex flex-col gap-2px'>
          <span className='text-14px font-[500] text-t-primary'>
            {t('settings.governance.policies.banned_backends.title')}
          </span>
          <Typography.Text type='secondary' className='text-12px'>
            {t('settings.governance.policies.banned_backends.description')}
          </Typography.Text>
          <UpdatedHint entry={findPolicy(items, 'banned_backends')} />
        </div>
        <div className='flex items-start gap-8px'>
          <Input.TextArea
            data-testid='banned-backends-input'
            className='flex-1'
            autoSize={{ minRows: 1, maxRows: 4 }}
            value={backendDraft}
            disabled={!canManage || busyKey !== null}
            placeholder={t('settings.governance.policies.banned_backends.placeholder')}
            onChange={setBackendDraft}
          />
          <Button
            type='primary'
            data-testid='banned-backends-save'
            disabled={!canManage || !backendsDirty || parsed.invalid.length > 0}
            loading={busyKey === 'banned_backends'}
            onClick={() => void save('banned_backends', parsed.names)}
          >
            {t('settings.governance.save')}
          </Button>
        </div>
        {parsed.invalid.length > 0 ? (
          <div className='text-12px text-[rgb(var(--danger-6))]' data-testid='banned-backends-invalid'>
            {t('settings.governance.policies.banned_backends.invalid', { names: parsed.invalid.join(', ') })}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PoliciesPanel;
