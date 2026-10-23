/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { FanoutGroup } from '@/common/types/fanout';
import { isFanoutTerminal, siderFanoutGroups } from '@/renderer/pages/conversation/fanout/fanoutModel';
import { iconColors } from '@renderer/styles/colors';
import { cleanupSiderTooltips } from '@renderer/utils/ui/siderTooltip';
import { Spin, Tooltip } from '@arco-design/web-react';
import { Branch, Right } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';

type FanoutSiderGroupProps = {
  collapsed: boolean;
  pathname: string;
  siderTooltipProps: Partial<React.ComponentProps<typeof Tooltip>>;
  onSessionClick?: () => void;
};

const EXPANDED_KEY = 'fanout-section-expanded';

const slotSummary = (group: FanoutGroup): string =>
  group.slots.map((slot) => (slot.slot === group.winner_slot ? `${slot.slot}✓` : slot.slot)).join(' ');

/**
 * Sider entry for fan-out groups (M7 E3-5): recent groups with their slots,
 * each opening `/fanout/:id`. Hidden when Core has no fan-out API or no groups.
 */
const FanoutSiderGroup: React.FC<FanoutSiderGroupProps> = ({
  collapsed,
  pathname,
  siderTooltipProps,
  onSessionClick,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, mutate } = useSWR(
    'fanout.sider',
    (): Promise<FanoutGroup[] | null> => ipcBridge.fanout.list.invoke(undefined).catch((): null => null),
    {
      revalidateOnFocus: false,
    }
  );
  const [expanded, setExpanded] = useState<boolean>(() => localStorage.getItem(EXPANDED_KEY) !== 'false');
  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, String(expanded));
  }, [expanded]);
  useEffect(() => ipcBridge.fanout.changed.on(() => void mutate()), [mutate]);

  const open = useCallback(
    (id: string) => {
      cleanupSiderTooltips();
      navigate(`/fanout/${id}`);
      onSessionClick?.();
    },
    [navigate, onSessionClick]
  );

  const groups = siderFanoutGroups(Array.isArray(data) ? data : null);
  if (groups.length === 0) return null;

  const icon = (group: FanoutGroup) =>
    isFanoutTerminal(group.status) ? (
      <Branch theme='outline' size='16' fill={iconColors.primary} style={{ lineHeight: 0 }} />
    ) : (
      <Spin size={14} />
    );

  if (collapsed) {
    return (
      <div className='shrink-0 flex flex-col gap-2px' data-testid='fanout-sider-group'>
        {groups.map((group) => (
          <Tooltip key={group.id} {...siderTooltipProps} content={group.title} position='right'>
            <div
              data-testid={`fanout-sider-item-${group.id}`}
              className={classNames(
                'w-full h-40px flex items-center justify-center cursor-pointer transition-colors rd-8px',
                pathname === `/fanout/${group.id}` ? '!bg-active' : 'hover:bg-fill-3 active:bg-fill-4'
              )}
              onClick={() => open(group.id)}
            >
              {icon(group)}
            </div>
          </Tooltip>
        ))}
      </div>
    );
  }

  return (
    <div className='shrink-0 flex flex-col gap-2px' data-testid='fanout-sider-group'>
      <div
        className='group/label sider-section-label flex items-center px-12px h-28px select-none sticky top-0 z-10 mt-8px cursor-pointer'
        data-testid='fanout-section-toggle'
        onClick={() => setExpanded((v) => !v)}
      >
        <span className='text-14px text-t-tertiary sider-section-title group-hover/label:text-t-primary transition-colors font-[500] leading-none'>
          {t('conversation.fanout.siderTitle')}
        </span>
        <span className='ms-2px flex items-center justify-center opacity-0 group-hover/label:opacity-100 transition-opacity text-t-tertiary shrink-0'>
          <Right
            theme='outline'
            size={12}
            className={classNames('transition-transform duration-150', { 'rotate-90': expanded })}
          />
        </span>
      </div>
      {expanded &&
        groups.map((group) => (
          <div
            key={group.id}
            data-testid={`fanout-sider-item-${group.id}`}
            className={classNames(
              'mx-4px flex items-center gap-8px px-8px h-36px cursor-pointer rd-8px transition-colors',
              pathname === `/fanout/${group.id}` ? '!bg-active' : 'hover:bg-fill-3 active:bg-fill-4'
            )}
            title={group.title}
            onClick={() => open(group.id)}
          >
            <span className='flex size-16px shrink-0 items-center justify-center'>{icon(group)}</span>
            <span className='min-w-0 flex-1 truncate text-14px text-t-primary'>{group.title}</span>
            <span className='shrink-0 text-11px text-t-tertiary' data-testid='fanout-sider-slots'>
              {slotSummary(group)}
            </span>
          </div>
        ))}
    </div>
  );
};

export default FanoutSiderGroup;
