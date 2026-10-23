/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ipcBridge } from '@/common';
import type { IContextBreakdown, IContextBreakdownSegment } from '@/common/adapter/ipcBridge';
import { isBackendHttpError } from '@/common/adapter/httpBridge';

import { formatTokenCount } from './ContextUsageIndicator';

const KNOWN_SEGMENTS = new Set([
  'system_prompt',
  'system_tools',
  'mcp_tools',
  'tools',
  'skills',
  'memory_files',
  'custom_agents',
  'messages',
  'other',
]);

const PALETTE = [
  'rgb(var(--primary-6))',
  'rgb(var(--success-6))',
  'rgb(var(--warning-6))',
  'rgb(var(--purple-6, var(--primary-4)))',
  'rgb(var(--cyan-6, var(--success-4)))',
  'rgb(var(--orangered-6, var(--warning-4)))',
  'rgb(var(--magenta-6, var(--danger-4)))',
  'rgb(var(--lime-6, var(--success-3)))',
];
const OTHER_COLOR = 'var(--color-fill-4)';

export type BreakdownState =
  | { kind: 'idle' }
  | { kind: 'ready'; data: IContextBreakdown }
  /** Older Core without the route, or any failure: render nothing. */
  | { kind: 'unavailable' };

/**
 * Fetch the breakdown each time `open` turns true. A 404 (older Core) or any
 * error degrades to `unavailable` so the indicator keeps its plain ring.
 */
export function useContextBreakdown(conversationId: string | undefined, open: boolean): BreakdownState {
  const [state, setState] = useState<BreakdownState>({ kind: 'idle' });
  useEffect(() => {
    if (!open || !conversationId) return;
    let cancelled = false;
    ipcBridge.conversation.getContextBreakdown
      .invoke({ conversation_id: conversationId })
      .then((data) => {
        if (!cancelled) setState(data ? { kind: 'ready', data } : { kind: 'unavailable' });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (!(isBackendHttpError(error) && error.status === 404)) {
          console.debug('[ContextBreakdown] fetch failed', error);
        }
        setState({ kind: 'unavailable' });
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, open]);
  return state;
}

function segmentColor(segment: IContextBreakdownSegment, index: number): string {
  return segment.key === 'other' ? OTHER_COLOR : PALETTE[index % PALETTE.length];
}

interface ContextBreakdownPanelProps {
  data: IContextBreakdown;
  size?: number;
}

/** Donut of the context window composition plus a legend. */
export const ContextBreakdownPanel: React.FC<ContextBreakdownPanelProps> = ({ data, size = 64 }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language;
  const segments = data.segments.filter((segment) => segment.tokens > 0);
  const used = typeof data.used === 'number' ? data.used : 0;
  if (segments.length === 0 || used <= 0) return null;

  // Denominator: the reported window when known, else `used` (a full ring of
  // composition, no free-space claim).
  const windowSize = typeof data.size === 'number' && data.size >= used ? data.size : used;
  const free = windowSize - used;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const labelFor = (segment: IContextBreakdownSegment) =>
    KNOWN_SEGMENTS.has(segment.key)
      ? t(`conversation.contextUsage.segments.${segment.key}`, segment.label)
      : segment.label;

  return (
    <div className='mt-8px pt-8px border-t border-solid border-[var(--color-border-2)]' data-testid='context-breakdown'>
      <div className='text-12px font-medium text-t-primary mb-6px'>
        {t('conversation.contextUsage.breakdownTitle', 'Context breakdown')}
      </div>
      <div className='flex items-start gap-12px'>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}
          aria-hidden='true'
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill='none'
            stroke='var(--color-fill-2)'
            strokeWidth={strokeWidth}
          />
          {segments.map((segment, index) => {
            const length = (segment.tokens / windowSize) * circumference;
            const dash = `${length} ${circumference - length}`;
            const element = (
              <circle
                key={segment.key}
                data-segment={segment.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill='none'
                stroke={segmentColor(segment, index)}
                strokeWidth={strokeWidth}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return element;
          })}
        </svg>
        <ul className='m-0 p-0 list-none flex-1 min-w-0'>
          {segments.map((segment, index) => (
            <li key={segment.key} className='flex items-center gap-6px text-12px text-t-secondary leading-18px'>
              <span
                className='inline-block w-8px h-8px rounded-full flex-shrink-0'
                style={{ background: segmentColor(segment, index) }}
              />
              <span className='truncate flex-1'>{labelFor(segment)}</span>
              <span className='tabular-nums'>{formatTokenCount(segment.tokens, locale)}</span>
              {segment.source === 'estimated' && (
                <span
                  title={t('conversation.contextUsage.estimatedHint', 'Estimated locally')}
                  className='text-t-tertiary'
                >
                  {t('conversation.contextUsage.estimated', 'est.')}
                </span>
              )}
            </li>
          ))}
          {free > 0 && (
            <li className='flex items-center gap-6px text-12px text-t-tertiary leading-18px'>
              <span className='inline-block w-8px h-8px rounded-full flex-shrink-0 bg-[var(--color-fill-2)]' />
              <span className='truncate flex-1'>{t('conversation.contextUsage.free', 'Free')}</span>
              <span className='tabular-nums'>{formatTokenCount(free, locale)}</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default ContextBreakdownPanel;
