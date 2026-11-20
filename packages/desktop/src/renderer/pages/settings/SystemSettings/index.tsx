/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';
import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

const SystemSettings: React.FC = () => {
  const location = useLocation();
  const isAboutPage = location.pathname === '/settings/about';
  const { t } = useTranslation();

  return (
    <SettingsPageWrapper contentClassName={isAboutPage ? 'max-w-640px' : undefined}>
      {isAboutPage ? (
        // About keeps its own brand hero.
        <AboutModalContent />
      ) : (
        <div className='flex flex-col gap-16px'>
          <SettingsPageHeader
            title={t('settings.system')}
            description={t('settings.pageIntro.system')}
            data-testid='settings-page-header-system'
          />
          <SystemModalContent />
        </div>
      )}
    </SettingsPageWrapper>
  );
};

export default SystemSettings;
