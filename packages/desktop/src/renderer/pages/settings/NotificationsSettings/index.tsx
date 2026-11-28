/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** 3.0 V7: Notifications as its own settings page (moved out of System). */

import React from 'react';
import { useTranslation } from 'react-i18next';
import NotificationSettingsSection from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/NotificationSettingsSection';
import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

export const NotificationsSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-16px' data-testid='notifications-settings'>
      <SettingsPageHeader
        title={t('settings.notificationsPage.title')}
        description={t('settings.notificationsPage.description')}
      />
      <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-14px'>
        <NotificationSettingsSection />
      </div>
    </div>
  );
};

const NotificationsSettings: React.FC = () => (
  <SettingsPageWrapper>
    <NotificationsSettingsContent />
  </SettingsPageWrapper>
);

export default NotificationsSettings;
