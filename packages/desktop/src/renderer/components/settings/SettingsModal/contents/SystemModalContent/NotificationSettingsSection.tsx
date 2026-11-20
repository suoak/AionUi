/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Collapse, Switch } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BrowserNotificationGrant from './BrowserNotificationGrant';
import PreferenceRow from './PreferenceRow';

/**
 * Notification switch with its sub-options (scheduled-task notifications on
 * desktop, browser permission in WebUI). Shared by the settings modal's System
 * tab and the 3.0 V7 Notifications settings page. Same `system.*` config keys.
 */
const NotificationSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [cronNotificationEnabled, setCronNotificationEnabled] = useState(false);

  useEffect(() => {
    setNotificationEnabled(configService.get('system.notificationEnabled') ?? true);
    setCronNotificationEnabled(configService.get('system.cronNotificationEnabled') ?? false);
  }, []);

  const handleNotificationEnabledChange = useCallback((checked: boolean) => {
    setNotificationEnabled(checked);
    configService.set('system.notificationEnabled', checked).catch(() => {
      setNotificationEnabled(!checked);
      configService.setLocal('system.notificationEnabled', !checked);
    });
  }, []);

  const handleCronNotificationEnabledChange = useCallback((checked: boolean) => {
    setCronNotificationEnabled(checked);
    configService.set('system.cronNotificationEnabled', checked).catch(() => {
      setCronNotificationEnabled(!checked);
      configService.setLocal('system.cronNotificationEnabled', !checked);
    });
  }, []);

  return (
    <Collapse
      bordered={false}
      activeKey={notificationEnabled ? ['notification'] : []}
      onChange={(_, keys) => {
        const shouldExpand = (keys as string[]).includes('notification');
        if (shouldExpand && !notificationEnabled) {
          handleNotificationEnabledChange(true);
        } else if (!shouldExpand && notificationEnabled) {
          handleNotificationEnabledChange(false);
        }
      }}
      className='[&_.arco-collapse-item]:!border-none [&_.arco-collapse-item-header]:!px-0 [&_.arco-collapse-item-header-title]:!flex-1 [&_.arco-collapse-item-content-box]:!px-0 [&_.arco-collapse-item-content-box]:!pb-0'
      data-testid='notification-settings-section'
    >
      <Collapse.Item
        name='notification'
        showExpandIcon={false}
        header={
          <div className='flex flex-1 items-center justify-between w-full'>
            <span className='text-14px text-2 ms-12px'>{t('settings.notification')}</span>
            <Switch
              checked={notificationEnabled}
              onClick={(e) => e.stopPropagation()}
              onChange={handleNotificationEnabledChange}
              data-testid='notification-enabled-switch'
            />
          </div>
        }
      >
        {isDesktop ? (
          <div className='ps-12px'>
            <PreferenceRow label={t('settings.cronNotificationEnabled')}>
              <Switch
                checked={cronNotificationEnabled}
                disabled={!notificationEnabled}
                onChange={handleCronNotificationEnabledChange}
                data-testid='cron-notification-switch'
              />
            </PreferenceRow>
          </div>
        ) : (
          <BrowserNotificationGrant />
        )}
      </Collapse.Item>
    </Collapse>
  );
};

export default NotificationSettingsSection;
