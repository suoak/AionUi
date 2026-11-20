/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import AppearanceModalContent from '@/renderer/components/settings/SettingsModal/contents/AppearanceModalContent';
import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

const AppearanceSettings: React.FC = () => {
  const { t } = useTranslation();
  return (
    <SettingsPageWrapper>
      {/* 3.0 V7: shared settings page header above the legacy modal content. */}
      <div className='flex flex-col gap-16px'>
        <SettingsPageHeader
          title={t('settings.appearancePanel')}
          description={t('settings.pageIntro.appearance')}
          data-testid='settings-page-header-appearance'
        />
        <AppearanceModalContent />
      </div>
    </SettingsPageWrapper>
  );
};

export default AppearanceSettings;
