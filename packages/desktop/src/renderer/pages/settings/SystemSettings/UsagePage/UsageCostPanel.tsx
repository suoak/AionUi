/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Radio, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { UsageGroupBy, UsageSummaryGroup } from '@/common/adapter/ipcBridge';
import { formatCostAmount, formatTokenCount } from '@/renderer/components/agent/ContextUsageIndicator';
import { clientTzOffsetMinutes, costCell } from './usageSummaryModel';

const GROUPS: UsageGroupBy[] = ['task', 'assistant', 'day', 'week'];
const GROUP_LIMIT = 50;

export const UsageCostValue: React.FC<{ group: UsageSummaryGroup; locale: string }> = ({ group, locale }) => {
  const { t } = useTranslation();
  const cell = costCell(group);
  if (cell.kind === 'unavailable') {
    return (
      <Tooltip content={t('settings.usage.costUnavailableHint')}>
        <span data-testid='usage-cost-unavailable' className='text-12px text-t-tertiary'>
          {t('settings.usage.costUnavailable')}
        </span>
      </Tooltip>
    );
  }
  return (
    <span className='flex flex-col items-end gap-2px'>
      {cell.amounts.map((amount) => (
        <span key={amount.currency} data-testid='usage-cost-amount' className='text-12px text-t-primary'>
          {formatCostAmount(amount, locale)}
        </span>
      ))}
      {cell.partial ? (
        <Tooltip content={t('settings.usage.costPartialHint')}>
          <Tag size='small'>{t('settings.usage.costPartial')}</Tag>
        </Tooltip>
      ) : null}
    </span>
  );
};

/**
 * Cost ledger from aioncore's `GET /api/usage/summary` (M7 E5-6): by task,
 * assistant, day and week, with per-currency provider-reported cost. Renders
 * nothing when the core has no summary endpoint (older aioncore).
 */
const UsageCostPanel: React.FC<{ since: number | null; locale: string }> = ({ since, locale }) => {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = useState<UsageGroupBy>('task');
  const { data, error } = useSWR(['usageSummary', groupBy, since], () =>
    ipcBridge.usage.summary.invoke({
      group_by: groupBy,
      since: since ?? undefined,
      tz_offset_minutes: clientTzOffsetMinutes(),
      limit: GROUP_LIMIT,
    })
  );
  if (error) return null;

  const groupLabel = (group: UsageSummaryGroup) => {
    if (group.label) return group.label;
    if (group.key) return group.key;
    return groupBy === 'task' ? t('settings.usage.notTaskLinked') : t('settings.usage.notLinked');
  };

  return (
    <div
      data-testid='usage-cost-panel'
      className='rounded-12px border border-solid border-transparent bg-base px-16px py-16px'
    >
      <div className='mb-12px flex flex-wrap items-center justify-between gap-8px'>
        <Typography.Text className='text-13px font-medium text-t-primary'>
          {t('settings.usage.costLedgerTitle')}
        </Typography.Text>
        <Radio.Group type='button' size='small' value={groupBy} onChange={(value: UsageGroupBy) => setGroupBy(value)}>
          {GROUPS.map((group) => (
            <Radio key={group} value={group}>
              {t(`settings.usage.groupBy.${group}`)}
            </Radio>
          ))}
        </Radio.Group>
      </div>
      {data ? (
        <>
          <div className='mb-8px flex items-center justify-between gap-12px border-b border-solid border-border-2 pb-8px'>
            <span className='text-12px font-medium text-t-secondary'>{t('settings.usage.costTotal')}</span>
            <span className='flex items-center gap-12px'>
              <span className='text-12px text-t-secondary'>{formatTokenCount(data.totals.total_tokens, locale)}</span>
              <UsageCostValue group={data.totals} locale={locale} />
            </span>
          </div>
          {data.totals.unavailable_turns > 0 ? (
            <div data-testid='usage-unavailable-turns' className='mb-8px text-11px text-t-tertiary'>
              {t('settings.usage.unavailableTurns', { count: data.totals.unavailable_turns })}
            </div>
          ) : null}
          {data.groups.length === 0 ? (
            <div className='text-12px text-t-tertiary'>{t('settings.usage.emptyTitle')}</div>
          ) : (
            <div className='flex flex-col gap-6px'>
              {data.groups.map((group) => (
                <div
                  key={group.key || '__unlinked'}
                  data-testid='usage-cost-row'
                  className='flex items-start justify-between gap-12px'
                >
                  <span className='min-w-0'>
                    <span className='block truncate text-13px text-t-primary'>{groupLabel(group)}</span>
                    <span className='block text-11px text-t-tertiary'>
                      {t('settings.usage.costRowTurns', { count: group.turns })}
                      {group.unavailable_turns > 0
                        ? ` · ${t('settings.usage.unavailableTurns', { count: group.unavailable_turns })}`
                        : ''}
                    </span>
                  </span>
                  <span className='flex shrink-0 items-start gap-12px'>
                    <span className='text-12px text-t-secondary'>{formatTokenCount(group.total_tokens, locale)}</span>
                    <UsageCostValue group={group} locale={locale} />
                  </span>
                </div>
              ))}
            </div>
          )}
          {data.truncated ? (
            <div className='mt-8px text-11px text-t-quaternary'>{t('settings.usage.costTruncated')}</div>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

export default UsageCostPanel;
