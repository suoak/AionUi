/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Message, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import WorkMateModal from '@/renderer/components/base/WorkMateModal';
import { formatCostAmount, formatTokenCount } from '@/renderer/components/agent/ContextUsageIndicator';
import { useTokenUsageStats } from '@/renderer/hooks/chat/useTokenUsageStats';
import {
  breakdownUsageByAgent,
  breakdownUsageByAssistant,
  breakdownUsageByChannel,
  breakdownUsageByConversation,
  breakdownUsageByModel,
  buildUsageDailySeries,
  filterUsageEventsByModel,
  filterUsageToday,
  resolveUsageModelFilter,
  summarizeUsageEvents,
  usageEventsToCsv,
  type UsageRange,
} from '@/renderer/utils/chat/tokenUsageAggregate';
import { backfillUsageFromConversations } from '@/renderer/utils/chat/tokenUsageBackfill';
import SettingsPageHeader from '../../components/SettingsPageHeader';
import SettingsPageWrapper from '../../components/SettingsPageWrapper';
import UsageBreakdownList from './UsageBreakdownList';
import UsageTrendChart from './UsageTrendChart';

const RANGES: UsageRange[] = ['7d', '30d', '90d', 'all'];

const UsageSummaryCard: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div
    data-testid='usage-summary-card'
    className='rounded-12px border border-solid border-transparent bg-base px-16px py-14px'
  >
    <div className='text-12px text-t-tertiary'>{label}</div>
    <div className='mt-6px text-22px font-600 leading-none text-t-primary'>{value}</div>
    {hint ? <div className='mt-8px text-12px text-t-quaternary'>{hint}</div> : null}
  </div>
);

const UsagePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [range, setRange] = useState<UsageRange>('30d');
  const [modelFilter, setModelFilter] = useState('all');
  const [clearVisible, setClearVisible] = useState(false);
  const { events, visibleEvents, refresh, clear, usesBackend } = useTokenUsageStats(range);

  useEffect(() => {
    if (usesBackend) {
      return;
    }
    let cancelled = false;
    void ipcBridge.database.getUserConversations
      .invoke({ limit: 100 })
      .then((page) => {
        if (cancelled || !page?.items?.length) {
          return;
        }
        if (backfillUsageFromConversations(page.items) > 0) {
          refresh();
        }
      })
      .catch(() => {
        // Historical backfill is best-effort; live recording still works.
      });
    return () => {
      cancelled = true;
    };
  }, [refresh, usesBackend]);

  const byModel = useMemo(
    () => breakdownUsageByModel(visibleEvents, t('settings.usage.unknownModel')),
    [t, visibleEvents]
  );
  const activeModelFilter = useMemo(
    () =>
      resolveUsageModelFilter(
        modelFilter,
        byModel.map((row) => row.key)
      ),
    [byModel, modelFilter]
  );
  const scopedEvents = useMemo(
    () => filterUsageEventsByModel(visibleEvents, activeModelFilter),
    [activeModelFilter, visibleEvents]
  );
  const scopedByModel = useMemo(
    () => breakdownUsageByModel(scopedEvents, t('settings.usage.unknownModel')),
    [scopedEvents, t]
  );
  const totals = useMemo(() => summarizeUsageEvents(scopedEvents), [scopedEvents]);
  const todayTotals = useMemo(
    () => summarizeUsageEvents(filterUsageToday(filterUsageEventsByModel(events, activeModelFilter))),
    [activeModelFilter, events]
  );
  const daily = useMemo(() => buildUsageDailySeries(scopedEvents, range), [range, scopedEvents]);
  const byAgent = useMemo(
    () => breakdownUsageByAgent(scopedEvents, t('settings.usage.unknownAgent')),
    [scopedEvents, t]
  );
  const byAssistant = useMemo(
    () => breakdownUsageByAssistant(scopedEvents, t('settings.usage.unknownAssistant')),
    [scopedEvents, t]
  );
  const byChannel = useMemo(
    () => breakdownUsageByChannel(scopedEvents, t('settings.usage.unknownChannel')),
    [scopedEvents, t]
  );
  const recentConversations = useMemo(
    () => breakdownUsageByConversation(scopedEvents, t('settings.usage.unnamedConversation')).slice(0, 8),
    [scopedEvents, t]
  );

  const handleClear = () => {
    clear();
    setClearVisible(false);
    Message.success(t('settings.usage.clearSuccess'));
  };

  const handleExport = () => {
    if (scopedEvents.length === 0) {
      return;
    }
    const blob = new Blob([usageEventsToCsv(scopedEvents)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workmate-usage-${range}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    Message.success(t('settings.usage.exportSuccess'));
  };

  return (
    <SettingsPageWrapper>
      <div data-testid='usage-stats-page' className='flex flex-col gap-16px'>
        <SettingsPageHeader
          data-testid='usage-stats-header'
          title={t('settings.usage.title')}
          description={t('settings.usage.description')}
          actions={
            <>
              <Button
                size='small'
                type='outline'
                data-testid='usage-export-btn'
                onClick={handleExport}
                disabled={scopedEvents.length === 0}
              >
                {t('settings.usage.export')}
              </Button>
              <Button
                size='small'
                type='outline'
                data-testid='usage-clear-btn'
                onClick={() => setClearVisible(true)}
                disabled={events.length === 0}
              >
                {t('settings.usage.clear')}
              </Button>
            </>
          }
          tabs={RANGES.map((key) => ({
            key,
            label: t(`settings.usage.range${key === 'all' ? 'All' : key}`),
          }))}
          activeTab={range}
          onTabChange={(key) => setRange(key as UsageRange)}
        />

        {visibleEvents.length > 0 ? (
          <div className='flex flex-wrap gap-8px' data-testid='usage-model-filter'>
            <Button
              size='mini'
              type={activeModelFilter === 'all' ? 'primary' : 'outline'}
              onClick={() => setModelFilter('all')}
            >
              {t('settings.usage.filterAllModels')}
            </Button>
            {byModel.map((row) => (
              <Button
                key={row.key}
                size='mini'
                type={activeModelFilter === row.key ? 'primary' : 'outline'}
                data-testid={`usage-model-filter-${row.key}`}
                onClick={() => setModelFilter(row.key)}
              >
                {row.label} · {formatTokenCount(row.total_tokens)}
              </Button>
            ))}
          </div>
        ) : null}

        <div className='grid grid-cols-2 gap-10px md:grid-cols-4'>
          <UsageSummaryCard
            label={t('settings.usage.totalTokens')}
            value={formatTokenCount(totals.total_tokens)}
            hint={t('settings.usage.turnsAndConversations', {
              turns: totals.turn_count,
              conversations: totals.conversation_count,
            })}
          />
          <UsageSummaryCard
            label={t('settings.usage.todayTokens')}
            value={formatTokenCount(todayTotals.total_tokens)}
            hint={t('settings.usage.turnsAndConversations', {
              turns: todayTotals.turn_count,
              conversations: todayTotals.conversation_count,
            })}
          />
          <UsageSummaryCard label={t('settings.usage.inputTokens')} value={formatTokenCount(totals.input_tokens)} />
          <UsageSummaryCard label={t('settings.usage.outputTokens')} value={formatTokenCount(totals.output_tokens)} />
        </div>

        {totals.cost_amount > 0 ? (
          <div className='rounded-12px border border-solid border-transparent bg-base px-16px py-12px text-13px text-t-secondary'>
            {t('settings.usage.estimatedCost')}{' '}
            <span className='font-600 text-t-primary'>
              {formatCostAmount({ amount: totals.cost_amount, currency: totals.cost_currency || 'USD' })}
            </span>
          </div>
        ) : null}

        <div className='rounded-12px border border-solid border-transparent bg-base px-16px py-16px'>
          <Typography.Text className='mb-12px block text-13px font-medium text-t-primary'>
            {t('settings.usage.trendTitle')}
          </Typography.Text>
          <UsageTrendChart
            points={daily}
            emptyLabel={t('settings.usage.emptyTitle')}
            inputLabel={t('settings.usage.inputTokens')}
            outputLabel={t('settings.usage.outputTokens')}
          />
        </div>

        {scopedEvents.length === 0 ? (
          <div
            data-testid='usage-empty-state'
            className='rounded-12px border border-dashed border-border-2 px-20px py-28px text-center'
          >
            <div className='text-14px font-medium text-t-primary'>{t('settings.usage.emptyTitle')}</div>
            <div className='mt-6px text-12px text-t-secondary'>{t('settings.usage.emptyDescription')}</div>
          </div>
        ) : (
          <div className='grid grid-cols-1 gap-10px md:grid-cols-2'>
            <div className='rounded-12px border border-solid border-transparent bg-base px-16px py-16px'>
              <Typography.Text className='mb-12px block text-13px font-medium text-t-primary'>
                {t('settings.usage.byAgentTitle')}
              </Typography.Text>
              <UsageBreakdownList rows={byAgent} emptyLabel={t('settings.usage.emptyTitle')} />
            </div>
            <div className='rounded-12px border border-solid border-transparent bg-base px-16px py-16px'>
              <Typography.Text className='mb-12px block text-13px font-medium text-t-primary'>
                {t('settings.usage.byAssistantTitle')}
              </Typography.Text>
              <UsageBreakdownList rows={byAssistant} emptyLabel={t('settings.usage.emptyTitle')} />
            </div>
            <div className='rounded-12px border border-solid border-transparent bg-base px-16px py-16px md:col-span-2'>
              <Typography.Text className='mb-12px block text-13px font-medium text-t-primary'>
                {t('settings.usage.byChannelTitle')}
              </Typography.Text>
              <UsageBreakdownList rows={byChannel} emptyLabel={t('settings.usage.emptyTitle')} />
            </div>
            <div className='rounded-12px border border-solid border-transparent bg-base px-16px py-16px md:col-span-2'>
              <Typography.Text className='mb-12px block text-13px font-medium text-t-primary'>
                {t('settings.usage.byModelTitle')}
              </Typography.Text>
              <UsageBreakdownList rows={scopedByModel} emptyLabel={t('settings.usage.emptyTitle')} />
            </div>
            <div className='rounded-12px border border-solid border-transparent bg-base px-16px py-16px md:col-span-2'>
              <Typography.Text className='mb-12px block text-13px font-medium text-t-primary'>
                {t('settings.usage.recentTitle')}
              </Typography.Text>
              <div className='flex flex-col gap-8px'>
                {recentConversations.map((row) => (
                  <Button
                    key={row.conversation_id}
                    type='text'
                    data-testid='usage-recent-row'
                    className='!flex !h-auto !items-center !justify-between !rounded-8px !px-8px !py-8px !text-left'
                    onClick={() => {
                      void navigate(`/conversation/${row.conversation_id}`);
                    }}
                  >
                    <span className='min-w-0'>
                      <span className='block truncate text-13px text-t-primary'>{row.label}</span>
                      <span className='block truncate text-11px text-t-tertiary'>{row.backend}</span>
                    </span>
                    <span className='shrink-0 text-12px text-t-secondary'>{formatTokenCount(row.total_tokens)}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <WorkMateModal
        visible={clearVisible}
        onCancel={() => setClearVisible(false)}
        header={{ title: t('settings.usage.clear'), showClose: true }}
        footer={
          <div className='flex justify-end gap-8px'>
            <Button onClick={() => setClearVisible(false)}>{t('common.cancel')}</Button>
            <Button type='primary' status='danger' onClick={handleClear} data-testid='usage-clear-confirm'>
              {t('settings.usage.clear')}
            </Button>
          </div>
        }
      >
        <Typography.Text>{t('settings.usage.clearConfirm')}</Typography.Text>
      </WorkMateModal>
    </SettingsPageWrapper>
  );
};

export default UsagePage;
