/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { classicThemeIdFor } from '@/common/theme/resolveTheme';
import { LIGHT_THEME_ID } from '@/common/theme/constants';
import { useThemeContext } from '@renderer/hooks/context/ThemeContext';
import { Button, Notification, Space } from '@arco-design/web-react';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const NOTICE_ID = 'theme-refresh-notice';

/**
 * Decide whether to show the one-time 3.0 "new look" notice. Shown once to anyone
 * whose selection follows the new defaults (Light → Ember, Dark → Dusk, Follow
 * System), with a one-click way back to the classic palette. Users on a classic,
 * decorative or custom theme never see it.
 */
export function shouldShowThemeRefreshNotice(activeId: string, alreadyShown: boolean): boolean {
  return !alreadyShown && classicThemeIdFor(activeId) !== null;
}

/** Mount once in the app shell. */
export function useThemeRefreshNotice(): void {
  const { t } = useTranslation();
  const { selectTheme } = useThemeContext();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;
    let cancelled = false;
    void (async () => {
      await configService.whenReady();
      if (cancelled) return;
      const activeId = (configService.get('theme.activeId') as string | undefined) || LIGHT_THEME_ID;
      const shown = configService.get('theme.refreshNoticeShown') === true;
      if (!shouldShowThemeRefreshNotice(activeId, shown)) return;
      await configService.set('theme.refreshNoticeShown', true);
      const classicId = classicThemeIdFor(activeId);
      Notification.info({
        id: NOTICE_ID,
        title: t('settings.cssTheme.refreshNotice.title'),
        content: t('settings.cssTheme.refreshNotice.content'),
        duration: 0,
        btn: (
          <Space>
            <Button size='small' type='secondary' onClick={() => Notification.remove(NOTICE_ID)}>
              {t('settings.cssTheme.refreshNotice.keep')}
            </Button>
            <Button
              size='small'
              type='primary'
              data-testid='theme-refresh-restore-classic'
              onClick={() => {
                Notification.remove(NOTICE_ID);
                if (classicId) void selectTheme(classicId);
              }}
            >
              {t('settings.cssTheme.refreshNotice.restoreClassic')}
            </Button>
          </Space>
        ),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [selectTheme, t]);
}
