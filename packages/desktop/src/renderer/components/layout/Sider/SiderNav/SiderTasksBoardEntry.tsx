/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@arco-design/web-react';
import { ViewGridCard } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { useNeedsYouCount } from '@/renderer/pages/tasks/useNeedsYouCount';

interface SiderTasksBoardEntryProps {
  isMobile: boolean;
  isActive: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onClick: () => void;
}

const SiderTasksBoardEntry: React.FC<SiderTasksBoardEntryProps> = ({
  isMobile,
  isActive,
  collapsed,
  siderTooltipProps,
  onClick,
}) => {
  const { t } = useTranslation();
  const needsYou = useNeedsYouCount();
  const tooltip =
    needsYou > 0
      ? `${t('common.primaryNav.tasks')} · ${t('conversation.taskBoard.flow.needsYouCount', { count: needsYou })}`
      : t('common.primaryNav.tasks');
  const badge =
    needsYou > 0 ? (
      <span
        data-testid='sider-tasks-needs-you'
        aria-label={t('conversation.taskBoard.flow.needsYouCount', { count: needsYou })}
        className={classNames(
          'shrink-0 min-w-16px h-16px px-4px rd-8px bg-[rgb(var(--warning-6))] text-white text-11px leading-16px text-center',
          collapsed && 'absolute -top-2px -end-2px'
        )}
      >
        {needsYou > 99 ? '99+' : needsYou}
      </span>
    ) : null;

  if (collapsed) {
    return (
      <Tooltip {...siderTooltipProps} content={tooltip} position='right'>
        <div
          className={classNames(
            'relative w-full h-34px flex items-center justify-center cursor-pointer transition-colors rd-8px text-t-primary',
            isActive ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
          )}
          onClick={onClick}
          data-testid='sider-tasks-board-entry'
        >
          <ViewGridCard
            theme='outline'
            size='20'
            fill='currentColor'
            className='block leading-none shrink-0'
            style={{ lineHeight: 0 }}
          />
          {badge}
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip {...siderTooltipProps} content={tooltip} position='right'>
      <div
        className={classNames(
          'box-border group h-34px w-full flex items-center justify-start gap-8px ps-10px pe-8px rd-0.5rem cursor-pointer shrink-0 transition-all text-t-primary',
          isMobile && 'sider-action-btn-mobile',
          isActive ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
        )}
        onClick={onClick}
        data-testid='sider-tasks-board-entry'
      >
        <span className='size-22px flex items-center justify-center shrink-0 text-t-primary'>
          <ViewGridCard
            theme='outline'
            size='16'
            fill='currentColor'
            className='block leading-none'
            style={{ lineHeight: 0 }}
          />
        </span>
        <span className='collapsed-hidden min-w-0 flex-1 truncate text-t-primary text-14px font-[500] leading-24px'>
          {t('common.primaryNav.tasks')}
        </span>
        {badge}
      </div>
    </Tooltip>
  );
};

export default SiderTasksBoardEntry;
