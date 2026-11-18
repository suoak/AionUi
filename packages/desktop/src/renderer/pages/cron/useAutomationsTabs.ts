/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SettingsPageTab } from '@/renderer/pages/settings/components/SettingsPageHeader';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export type AutomationsTabKey = 'scheduled' | 'batch';

/** Each Automations tab is its own route, so deep links and back/forward keep working. */
export const AUTOMATIONS_TAB_PATHS: Record<AutomationsTabKey, string> = {
  scheduled: '/scheduled',
  batch: '/batch',
};

/** Header tab props shared by the Scheduled and Batch pages (the two halves of Automations). */
export function useAutomationsTabs(active: AutomationsTabKey): {
  tabs: SettingsPageTab[];
  activeTab: AutomationsTabKey;
  onTabChange: (key: string) => void;
} {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tabs = useMemo<SettingsPageTab[]>(
    () => [
      { key: 'scheduled', label: t('common.automations.tabs.scheduled') },
      { key: 'batch', label: t('common.automations.tabs.batch') },
    ],
    [t]
  );
  const onTabChange = useCallback(
    (key: string) => {
      if (key === active || !(key in AUTOMATIONS_TAB_PATHS)) return;
      void navigate(AUTOMATIONS_TAB_PATHS[key as AutomationsTabKey]);
    },
    [active, navigate]
  );
  return { tabs, activeTab: active, onTabChange };
}
