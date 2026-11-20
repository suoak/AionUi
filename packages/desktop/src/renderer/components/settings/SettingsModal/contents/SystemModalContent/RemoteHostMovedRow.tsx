/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import SettingsMovedRow from './SettingsMovedRow';

/** 3.0 V7: pointer left in System after Remote Host moved to its own settings page. */
const RemoteHostMovedRow: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { t } = useTranslation();
  return (
    <SettingsMovedRow
      title={t('settings.remoteHost.title')}
      hint={t('settings.remoteHost.movedHint')}
      openLabel={t('settings.remoteHost.openPage')}
      onOpen={onOpen}
      data-testid='remote-host-moved'
    />
  );
};

export default RemoteHostMovedRow;
