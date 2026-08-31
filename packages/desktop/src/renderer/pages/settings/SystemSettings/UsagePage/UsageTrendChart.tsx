/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { formatTokenCount } from '@/renderer/components/agent/ContextUsageIndicator';
import type { UsageDailyPoint } from '@/renderer/utils/chat/tokenUsageAggregate';

type UsageTrendChartProps = {
  points: UsageDailyPoint[];
  emptyLabel: string;
  inputLabel: string;
  outputLabel: string;
  locale: string;
};

const UsageTrendChart: React.FC<UsageTrendChartProps> = ({ points, emptyLabel, inputLabel, outputLabel, locale }) => {
  const max = Math.max(0, ...points.map((point) => point.total_tokens));
  const labelStep = Math.max(1, Math.ceil(points.length / 12));
  if (max <= 0) {
    return (
      <div
        className='flex h-140px items-center justify-center text-12px text-t-tertiary'
        data-testid='usage-trend-empty'
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div>
      <div className='mb-10px flex items-center gap-12px text-11px text-t-tertiary'>
        <span className='inline-flex items-center gap-4px'>
          <span className='h-8px w-8px rounded-2px bg-primary-3' />
          {inputLabel}
        </span>
        <span className='inline-flex items-center gap-4px'>
          <span className='h-8px w-8px rounded-2px bg-primary-6' />
          {outputLabel}
        </span>
      </div>
      <div className='flex h-160px items-end gap-4px' data-testid='usage-trend-chart'>
        {points.map((point, index) => {
          const height = Math.max(4, Math.round((point.total_tokens / max) * 100));
          const outputShare = point.total_tokens > 0 ? point.output_tokens / point.total_tokens : 0;
          return (
            <div key={point.date} className='flex min-w-0 flex-1 flex-col items-center gap-6px'>
              <div className='flex h-128px w-full items-end justify-center'>
                <div
                  className='flex w-70% max-w-18px flex-col justify-end overflow-hidden rounded-4px'
                  style={{ height: `${height}%` }}
                  title={`${point.date}: ${formatTokenCount(point.total_tokens, false, locale)}`}
                >
                  <div className='w-full bg-primary-6' style={{ height: `${Math.round(outputShare * 100)}%` }} />
                  <div className='min-h-2px w-full flex-1 bg-primary-3' />
                </div>
              </div>
              <div className='truncate text-10px text-t-quaternary'>
                {index % labelStep === 0 || index === points.length - 1 ? point.date.slice(5) : '\u00a0'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UsageTrendChart;
