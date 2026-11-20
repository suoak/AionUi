/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Analysis, Computer, Download, LinkCloud } from '@icon-park/react';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatTokenCount } from '@/renderer/components/agent/ContextUsageIndicator';
import { requestCommandPalette } from '@/renderer/components/command-palette/useCommandPalette';
import { KeyHint, StatusGlyph } from '@/renderer/components/design';
import { useConversationRunCounts } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';
import StatusBarItem from './StatusBarItem';
import { useHostSignal, useTodayTokens, useUpdateReady } from './useStatusBarSignals';

const ICON_PROPS = { theme: 'outline', size: 12, fill: 'currentColor', strokeWidth: 3 } as const;

/**
 * 3.0 shell status bar (24px, desktop): Host · running · needs you ·· today's usage ·
 * update · ⌘K. Every cell is a shortcut to the page that explains it.
 */
const StatusBar: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const host = useHostSignal();
  const runs = useConversationRunCounts();
  const todayTokens = useTodayTokens();
  const update = useUpdateReady();

  const go = useCallback(
    (path: string) => {
      Promise.resolve(navigate(path)).catch((error) => console.error('Navigation failed:', error));
    },
    [navigate]
  );

  const tokensLabel = formatTokenCount(todayTokens, i18n?.language);
  const hostLabel = host?.mode === 'remote' ? t('common.statusBar.hostRemote', { host: host.host }) : '';

  return (
    <div
      role='status'
      aria-label={t('common.statusBar.label')}
      data-testid='app-status-bar'
      className='shrink-0 h-24px box-border flex items-center gap-2px px-8px bg-wm-panel border-t border-t-solid border-wm-border-subtle select-none'
    >
      {host && (
        <StatusBarItem
          testId='status-bar-host'
          tooltip={t('common.statusBar.hostTooltip')}
          onClick={() => go('/settings/system')}
        >
          {host.mode === 'remote' ? <LinkCloud {...ICON_PROPS} /> : <Computer {...ICON_PROPS} />}
          <span>{host.mode === 'remote' ? hostLabel : t('common.statusBar.hostLocal')}</span>
        </StatusBarItem>
      )}
      <StatusBarItem testId='status-bar-working'>
        <StatusGlyph status={runs.working > 0 ? 'working' : 'idle'} size={10} />
        <span>{t('common.statusBar.working', { count: runs.working })}</span>
      </StatusBarItem>
      {runs.needsYou > 0 && (
        <StatusBarItem
          testId='status-bar-needs-you'
          emphasis='attention'
          tooltip={t('common.statusBar.needsYouTooltip')}
          onClick={runs.firstNeedsYouId ? () => go(`/conversation/${runs.firstNeedsYouId}`) : undefined}
        >
          <StatusGlyph status='needsYou' size={10} />
          <span>{t('common.statusBar.needsYou', { count: runs.needsYou })}</span>
        </StatusBarItem>
      )}
      <span className='flex-1' />
      <StatusBarItem
        testId='status-bar-usage'
        tooltip={t('common.statusBar.usageTooltip')}
        onClick={() => go('/settings/usage')}
      >
        <Analysis {...ICON_PROPS} />
        <span>{t('common.statusBar.usageToday', { tokens: tokensLabel })}</span>
      </StatusBarItem>
      {update.ready && (
        <StatusBarItem testId='status-bar-update' emphasis='attention' onClick={() => go('/settings/about')}>
          <Download {...ICON_PROPS} />
          <span>{t('common.statusBar.updateReady', { version: update.version })}</span>
        </StatusBarItem>
      )}
      <StatusBarItem
        testId='status-bar-command-palette'
        ariaLabel={t('common.statusBar.commandPalette')}
        tooltip={t('common.statusBar.commandPalette')}
        onClick={requestCommandPalette}
      >
        <KeyHint keys={['Mod', 'K']} />
      </StatusBarItem>
    </div>
  );
};

export default StatusBar;
