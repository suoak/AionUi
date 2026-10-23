/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { FANOUT_ADOPT_STRATEGIES, type FanoutAdoptStrategy, type FanoutGroup } from '@/common/types/fanout';
import { Alert, Checkbox, Input, Message, Modal, Radio } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAdoptRequest, DEFAULT_ADOPT_FORM, fanoutErrorKey, type AdoptFormState } from './fanoutModel';

type AdoptDialogProps = {
  visible: boolean;
  group: FanoutGroup;
  /** Winner slot label (`A`..`E`). */
  slot: string | null;
  onClose: () => void;
  onAdopted: (group: FanoutGroup) => void;
};

/**
 * Pick how the winner lands (design E3 §2.3): keep its branch only, or merge
 * it into the source repository's checked-out branch. Core never runs the
 * repository's git hooks while it does this, and the dialog says so.
 */
const AdoptDialog: React.FC<AdoptDialogProps> = ({ visible, group, slot, onClose, onAdopted }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState<AdoptFormState>(DEFAULT_ADOPT_FORM);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) setForm(DEFAULT_ADOPT_FORM);
  }, [visible, slot]);

  const update = (patch: Partial<AdoptFormState>) => setForm((prev) => ({ ...prev, ...patch }));
  const merges = form.strategy !== 'branch_only';

  const submit = async () => {
    if (!slot) return;
    setBusy(true);
    try {
      const next = await ipcBridge.fanout.adopt.invoke(buildAdoptRequest(group.id, slot, form));
      Message.success(t('conversation.fanout.adoptDone', { slot }));
      onAdopted(next);
      onClose();
    } catch (error) {
      console.warn('[fanout] adopt failed:', error);
      Message.error(t(fanoutErrorKey(isBackendHttpError(error) ? error.code : undefined)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      title={t('conversation.fanout.adoptTitle', { slot: slot ?? '' })}
      onCancel={onClose}
      onOk={() => void submit()}
      okText={t('conversation.fanout.adoptConfirm')}
      confirmLoading={busy}
      unmountOnExit
      data-testid='fanout-adopt-dialog'
    >
      <div className='flex flex-col gap-12px'>
        <Alert type='warning' content={t('conversation.fanout.adoptNoHooks')} data-testid='fanout-adopt-no-hooks' />
        <div className='flex flex-col gap-6px'>
          <span className='text-12px text-t-secondary'>{t('conversation.fanout.strategy')}</span>
          <Radio.Group
            direction='vertical'
            value={form.strategy}
            onChange={(value: FanoutAdoptStrategy) => update({ strategy: value })}
          >
            {FANOUT_ADOPT_STRATEGIES.map((strategy) => (
              <Radio key={strategy} value={strategy}>
                {t(`conversation.fanout.strategies.${strategy}`)}
              </Radio>
            ))}
          </Radio.Group>
        </div>
        {merges && (
          <label className='flex flex-col gap-4px text-12px text-t-secondary'>
            <span>{t('conversation.fanout.targetBranch')}</span>
            <Input
              size='small'
              value={form.targetBranch}
              onChange={(value) => update({ targetBranch: value })}
              placeholder={t('conversation.fanout.targetBranchPlaceholder')}
              allowClear
            />
          </label>
        )}
        <label className='flex flex-col gap-4px text-12px text-t-secondary'>
          <span>{t('conversation.fanout.snapshotMessage')}</span>
          <Input
            size='small'
            value={form.snapshotMessage}
            onChange={(value) => update({ snapshotMessage: value })}
            placeholder={t('conversation.fanout.snapshotMessagePlaceholder')}
            allowClear
          />
        </label>
        <Checkbox checked={form.removeOthers} onChange={(checked: boolean) => update({ removeOthers: checked })}>
          {t('conversation.fanout.removeOthers')}
        </Checkbox>
        <Checkbox checked={form.keepBranches} onChange={(checked: boolean) => update({ keepBranches: checked })}>
          {t('conversation.fanout.keepBranches')}
        </Checkbox>
        <span className='text-11px leading-16px text-t-tertiary'>{t('conversation.fanout.unmergedKept')}</span>
      </div>
    </Modal>
  );
};

export default AdoptDialog;
