/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { formatTokenCount } from '@/renderer/components/agent/ContextUsageIndicator';

type UsageBreakdownListProps = {
  rows: Array<{ key: string; label: string; total_tokens: number; turn_count: number }>;
  emptyLabel: string;
  locale: string;
};

const UsageBreakdownList: React.FC<UsageBreakdownListProps> = ({ rows, emptyLabel, locale }) => {
  const max = Math.max(0, ...rows.map((row) => row.total_tokens));
  if (rows.length === 0) {
    return <div className='py-18px text-center text-12px text-t-tertiary'>{emptyLabel}</div>;
  }

  return (
    <div className='flex flex-col gap-10px'>
      {rows.map((row) => (
        <div key={row.key} data-testid='usage-breakdown-row'>
          <div className='mb-4px flex items-center justify-between gap-8px text-12px'>
            <span className='truncate text-t-primary'>{row.label}</span>
            <span className='shrink-0 text-t-secondary'>
              {formatTokenCount(row.total_tokens, false, locale)} · {formatTokenCount(row.turn_count, false, locale)}
            </span>
          </div>
          <div className='h-6px overflow-hidden rounded-999px bg-fill-2'>
            <div
              className='h-full rounded-999px bg-primary-6'
              style={{ width: `${max > 0 ? Math.max(6, (row.total_tokens / max) * 100) : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default UsageBreakdownList;
