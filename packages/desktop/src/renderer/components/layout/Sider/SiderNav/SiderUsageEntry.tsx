/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@arco-design/web-react';
import { Analysis } from '@icon-park/react';
import classNames from 'classnames';
import { formatTokenCount } from '@/renderer/components/agent/ContextUsageIndicator';
import { useTokenUsageStats } from '@/renderer/hooks/chat/useTokenUsageStats';
import { filterUsageToday, summarizeUsageEvents } from '@/renderer/utils/chat/tokenUsageAggregate';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

type SiderUsageEntryProps = {
  isMobile: boolean;
  isActive: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onClick: () => void;
};

const SiderUsageEntry: React.FC<SiderUsageEntryProps> = ({
  isMobile,
  isActive,
  collapsed,
  siderTooltipProps,
  onClick,
}) => {
  const { t } = useTranslation();
  const { events } = useTokenUsageStats('all');
  const todayTokens = useMemo(() => summarizeUsageEvents(filterUsageToday(events)).total_tokens, [events]);
  const todayLabel = formatTokenCount(todayTokens);
  const tooltip = t('settings.usage.siderTooltip', { tokens: todayLabel, defaultValue: 'Usage · {{tokens}} today' });

  if (collapsed) {
    return (
      <Tooltip {...siderTooltipProps} content={tooltip} position='right'>
        <div
          data-testid='sider-usage-entry'
          className={classNames(
            'w-full h-34px flex items-center justify-center cursor-pointer transition-colors rd-8px text-t-primary',
            isActive ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
          )}
          onClick={onClick}
        >
          <Analysis
            theme='outline'
            size='20'
            fill='currentColor'
            className='block leading-none shrink-0'
            style={{ lineHeight: 0 }}
          />
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip {...siderTooltipProps} content={tooltip} position='right'>
      <div
        data-testid='sider-usage-entry'
        className={classNames(
          'box-border group h-34px w-full flex items-center justify-start gap-8px pl-10px pr-8px rd-0.5rem cursor-pointer shrink-0 transition-all text-t-primary',
          isMobile && 'sider-action-btn-mobile',
          isActive ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
        )}
        onClick={onClick}
      >
        <span className='size-22px flex items-center justify-center shrink-0 text-t-primary'>
          <Analysis
            theme='outline'
            size='16'
            fill='currentColor'
            className='block leading-none'
            style={{ lineHeight: 0 }}
          />
        </span>
        <span className='collapsed-hidden min-w-0 flex-1 truncate text-t-primary text-14px font-[500] leading-24px'>
          {t('settings.usage.title', { defaultValue: 'Usage' })}
        </span>
        <span className='collapsed-hidden shrink-0 text-12px text-t-tertiary' data-testid='sider-usage-today'>
          {todayLabel}
        </span>
      </div>
    </Tooltip>
  );
};

export default SiderUsageEntry;
