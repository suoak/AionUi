/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Empty, Input, Message, Modal, Select, Tag, Typography } from '@arco-design/web-react';
import { Iphone } from '@icon-park/react';
import { ipcBridge } from '@/common';
import type { IDevice } from '@/common/types/device';
import { formatDateTime } from '@/renderer/services/i18n/format';
import type { AutopilotChannelOption } from '@/renderer/pages/cron/ScheduledTasksPage/autopilot';
import {
  DEVICE_INACTIVITY_TTL_DAYS,
  DEVICE_NAME_MAX,
  deviceIdleDays,
  deviceIdleLevel,
  deviceLastActiveAt,
  getDeviceErrorMessage,
  validateDeviceName,
} from './devicesModel';

const PUSH_NONE = '__none__';

type DeviceListProps = {
  devices: IDevice[];
  /** IM sessions the user can receive pushes in (value = channel session id). */
  channels: AutopilotChannelOption[];
  onChanged: () => void;
  now?: () => number;
};

const IDLE_TAG_COLOR = { idle: 'orange', expiring: 'red', expired: 'red' } as const;

const DeviceList: React.FC<DeviceListProps> = ({ devices, channels, onChanged, now }) => {
  const { t, i18n } = useTranslation();
  const clock = now ?? Date.now;
  const [renaming, setRenaming] = useState<IDevice | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [revoking, setRevoking] = useState<IDevice | null>(null);
  const [busy, setBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState<string | null>(null);

  const nameError = renaming ? validateDeviceName(nameDraft) : undefined;

  const submitRename = async () => {
    if (!renaming || nameError || busy) return;
    setBusy(true);
    try {
      await ipcBridge.device.rename.invoke({ id: renaming.id, name: nameDraft.trim() });
      Message.success(t('settings.devices.renamed'));
      setRenaming(null);
      onChanged();
    } catch (err) {
      Message.error(getDeviceErrorMessage(err, t, 'rename'));
    } finally {
      setBusy(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revoking || busy) return;
    setBusy(true);
    try {
      await ipcBridge.device.revoke.invoke({ id: revoking.id });
      Message.success(t('settings.devices.revoked', { name: revoking.name }));
      setRevoking(null);
      onChanged();
    } catch (err) {
      Message.error(getDeviceErrorMessage(err, t, 'revoke'));
    } finally {
      setBusy(false);
    }
  };

  const changePush = async (device: IDevice, value: string) => {
    setPushBusy(device.id);
    try {
      await ipcBridge.device.setPush.invoke(
        value === PUSH_NONE
          ? { id: device.id, push_kind: 'none' }
          : { id: device.id, push_kind: 'im', push_target: value }
      );
      Message.success(t('settings.devices.push.saved'));
      onChanged();
    } catch (err) {
      Message.error(getDeviceErrorMessage(err, t, 'push'));
    } finally {
      setPushBusy(null);
    }
  };

  if (devices.length === 0) {
    return <Empty data-testid='device-list-empty' description={t('settings.devices.empty')} />;
  }

  return (
    <div className='flex flex-col gap-8px' data-testid='device-list'>
      {devices.map((device) => {
        const level = deviceIdleLevel(device, clock());
        const days = deviceIdleDays(device, clock());
        const currentPush = device.push_kind === 'im' && device.push_target ? device.push_target : PUSH_NONE;
        const pushOptions = [{ value: PUSH_NONE, label: t('settings.devices.push.none') }, ...channels];
        if (currentPush !== PUSH_NONE && !channels.some((c) => c.value === currentPush)) {
          pushOptions.push({ value: currentPush, label: t('settings.devices.push.unavailableTarget') });
        }
        return (
          <div
            key={device.id}
            data-testid='device-row'
            data-device-id={device.id}
            className='rd-12px border border-solid border-[var(--color-border-2)] p-12px flex flex-wrap items-center gap-12px'
          >
            <Iphone theme='outline' size='20' className='text-t-secondary shrink-0' />
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-6px min-w-0'>
                <span className='truncate text-14px font-[500] text-t-primary' data-testid='device-name'>
                  {device.name}
                </span>
                <Tag size='small'>
                  {t(`settings.devices.platform.${device.platform}`, { defaultValue: device.platform })}
                </Tag>
                {level !== 'active' ? (
                  <Tag size='small' color={IDLE_TAG_COLOR[level]} data-testid='device-idle' data-level={level}>
                    {level === 'expired'
                      ? t('settings.devices.idle.expired', { days: DEVICE_INACTIVITY_TTL_DAYS })
                      : t('settings.devices.idle.days', { days })}
                  </Tag>
                ) : null}
              </div>
              <Typography.Text type='secondary' className='text-12px' data-testid='device-last-active'>
                {device.last_seen_at
                  ? t('settings.devices.lastUsed', {
                      time: formatDateTime(deviceLastActiveAt(device), i18n.language),
                    })
                  : t('settings.devices.neverUsed', { time: formatDateTime(device.created_at, i18n.language) })}
              </Typography.Text>
              {level === 'expiring' ? (
                <div className='text-12px text-[rgb(var(--warning-6))]' data-testid='device-expiring-hint'>
                  {t('settings.devices.idle.expiringHint', { days: DEVICE_INACTIVITY_TTL_DAYS - days })}
                </div>
              ) : null}
            </div>
            <div className='flex items-center gap-8px shrink-0'>
              <span className='text-12px text-t-secondary'>{t('settings.devices.push.label')}</span>
              <Select
                size='small'
                className='w-200px'
                data-testid='device-push-select'
                value={currentPush}
                loading={pushBusy === device.id}
                disabled={pushBusy === device.id}
                options={pushOptions}
                onChange={(value: string) => {
                  if (value !== currentPush) void changePush(device, value);
                }}
              />
              <Button
                size='small'
                data-testid='device-rename'
                onClick={() => {
                  setNameDraft(device.name);
                  setRenaming(device);
                }}
              >
                {t('settings.devices.rename')}
              </Button>
              <Button size='small' status='danger' data-testid='device-revoke' onClick={() => setRevoking(device)}>
                {t('settings.devices.revoke')}
              </Button>
            </div>
          </div>
        );
      })}
      {channels.length === 0 ? (
        <Typography.Text type='secondary' className='text-12px' data-testid='device-push-no-channels'>
          {t('settings.devices.push.noChannels')}
        </Typography.Text>
      ) : null}
      <Modal
        visible={Boolean(renaming)}
        title={t('settings.devices.renameTitle')}
        okText={t('common.save', { defaultValue: 'Save' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        confirmLoading={busy}
        okButtonProps={{ disabled: Boolean(nameError), 'data-testid': 'device-rename-ok' } as never}
        unmountOnExit
        onOk={() => void submitRename()}
        onCancel={() => setRenaming(null)}
      >
        <Input
          data-testid='device-rename-input'
          value={nameDraft}
          maxLength={DEVICE_NAME_MAX}
          onChange={setNameDraft}
          onPressEnter={() => void submitRename()}
        />
        {nameError ? (
          <div className='mt-6px text-12px text-[rgb(var(--danger-6))]' data-testid='device-rename-error'>
            {t(`settings.devices.nameError.${nameError}`, { max: DEVICE_NAME_MAX })}
          </div>
        ) : null}
      </Modal>
      <Modal
        visible={Boolean(revoking)}
        title={t('settings.devices.revokeTitle')}
        okText={t('settings.devices.revokeConfirm')}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        confirmLoading={busy}
        okButtonProps={{ status: 'danger', 'data-testid': 'device-revoke-ok' } as never}
        unmountOnExit
        onOk={() => void confirmRevoke()}
        onCancel={() => setRevoking(null)}
      >
        <span data-testid='device-revoke-body'>{t('settings.devices.revokeBody', { name: revoking?.name ?? '' })}</span>
      </Modal>
    </div>
  );
};

export default DeviceList;
