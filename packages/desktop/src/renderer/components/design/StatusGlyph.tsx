/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { statusColorVar, type WmStatus } from '@/common/theme/designTokens';
import React from 'react';
import { useTranslation } from 'react-i18next';

export type StatusGlyphProps = {
  status: WmStatus;
  /** Pixel size of the glyph box. */
  size?: number;
  /** Overrides the default accessible label (the translated status name). */
  label?: string;
  className?: string;
};

const STATUS_LABEL_KEYS: Record<WmStatus, string> = {
  working: 'common.designSystem.status.working',
  needsYou: 'common.designSystem.status.needsYou',
  done: 'common.designSystem.status.done',
  failed: 'common.designSystem.status.failed',
  idle: 'common.designSystem.status.idle',
};

/**
 * The shared run-state glyph. Each state has a distinct shape so colour is never the
 * only signal: spinning ring, ringed question mark (soft pulse), check, cross, hollow dot.
 */
const StatusGlyph: React.FC<StatusGlyphProps> = ({ status, size = 12, label, className }) => {
  const { t } = useTranslation();
  const color = statusColorVar(status);
  return (
    <span
      role='img'
      aria-label={label ?? t(STATUS_LABEL_KEYS[status])}
      data-status={status}
      className={['inline-flex shrink-0 items-center justify-center', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size, color }}
    >
      <svg width={size} height={size} viewBox='0 0 12 12' fill='none' aria-hidden='true'>
        {status === 'working' && (
          <circle
            className='wm-glyph-spin'
            cx='6'
            cy='6'
            r='4.5'
            stroke='currentColor'
            strokeWidth='1.6'
            strokeLinecap='round'
            strokeDasharray='21 7.3'
          />
        )}
        {status === 'needsYou' && (
          // A question mark in a ring, not a dot, so it never reads as "done" or "idle" without colour.
          <g className='wm-glyph-pulse'>
            <circle cx='6' cy='6' r='5' stroke='currentColor' strokeWidth='1.2' />
            <path
              d='M4.4 4.6a1.6 1.6 0 1 1 2.3 1.45c-.45.23-.7.6-.7 1.1v.25'
              stroke='currentColor'
              strokeWidth='1.2'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
            <circle cx='6' cy='8.9' r='0.7' fill='currentColor' />
          </g>
        )}
        {status === 'done' && (
          <path
            d='M2.5 6.2 5 8.6l4.5-5'
            stroke='currentColor'
            strokeWidth='1.6'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        )}
        {status === 'failed' && (
          <path d='M3 3l6 6M9 3 3 9' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' />
        )}
        {status === 'idle' && <circle cx='6' cy='6' r='3.5' stroke='currentColor' strokeWidth='1.4' />}
      </svg>
    </span>
  );
};

export default StatusGlyph;
