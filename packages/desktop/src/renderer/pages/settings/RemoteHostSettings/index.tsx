/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 3.0 V7: Remote Host (SSH) as its own settings page, moved out of System.
 * Same E14 behaviour: system OpenSSH local forward, desktop-only, no password field.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import RemoteHostSshSection from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/RemoteHostSshSection';
import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

export const RemoteHostSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-16px' data-testid='remote-host-settings'>
      <SettingsPageHeader title={t('settings.remoteHost.title')} description={t('settings.remoteHost.description')} />
      <RemoteHostSshSection standalone />
    </div>
  );
};

const RemoteHostSettings: React.FC = () => (
  <SettingsPageWrapper>
    <RemoteHostSettingsContent />
  </SettingsPageWrapper>
);

export default RemoteHostSettings;
