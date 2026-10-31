/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Spin, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { IDevice } from '@/common/types/device';
import {
  autopilotChannelOptions,
  type AutopilotChannelOption,
} from '@/renderer/pages/cron/ScheduledTasksPage/autopilot';
import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import DeviceList from './DeviceList';
import PairDevicePanel from './PairDevicePanel';
import { MAX_DEVICES, getDeviceErrorMessage, isAtDeviceLimit } from './devicesModel';

type DevicesSettingsContentProps = {
  pollIntervalMs?: number;
  now?: () => number;
};

/** Paired phones: pair, list, rename, revoke and per-device push target. */
export const DevicesSettingsContent: React.FC<DevicesSettingsContentProps> = ({ pollIntervalMs, now }) => {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<IDevice[] | null>(null);
  const [channels, setChannels] = useState<AutopilotChannelOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Keep loading independent of `t` identity so a language switch does not refetch.
  const tRef = useRef(t);
  tRef.current = t;

  const loadDevices = useCallback(async () => {
    try {
      const list = await ipcBridge.device.list.invoke();
      setDevices(list ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError(getDeviceErrorMessage(err, tRef.current, 'load'));
      setDevices((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
    let cancelled = false;
    Promise.all([
      ipcBridge.channel.getActiveSessions.invoke().catch((): [] => []),
      ipcBridge.channel.getAuthorizedUsers.invoke().catch((): [] => []),
    ])
      .then(([sessions, users]) => {
        if (!cancelled) setChannels(autopilotChannelOptions(sessions ?? [], users ?? []));
      })
      .catch((): undefined => undefined);
    return () => {
      cancelled = true;
    };
  }, [loadDevices]);

  const count = devices?.length ?? 0;

  return (
    <div className='flex flex-col gap-16px' data-testid='devices-settings'>
      <SettingsPageHeader
        title={t('settings.devices.title')}
        description={t('settings.devices.description')}
        actions={
          <Typography.Text type='secondary' data-testid='device-count'>
            {t('settings.devices.count', { count, max: MAX_DEVICES })}
          </Typography.Text>
        }
      />
      {loadError ? <Alert type='error' data-testid='device-load-error' content={loadError} /> : null}
      <PairDevicePanel
        atLimit={isAtDeviceLimit(devices ?? undefined)}
        onPaired={() => void loadDevices()}
        pollIntervalMs={pollIntervalMs}
        now={now}
      />
      {devices === null ? (
        <Spin className='self-center' />
      ) : (
        <DeviceList devices={devices} channels={channels} onChanged={() => void loadDevices()} now={now} />
      )}
      <Typography.Text type='secondary' className='text-12px'>
        {t('settings.devices.approvalNote')}
      </Typography.Text>
    </div>
  );
};

const DevicesSettings: React.FC = () => (
  <SettingsPageWrapper>
    <DevicesSettingsContent />
  </SettingsPageWrapper>
);

export default DevicesSettings;
