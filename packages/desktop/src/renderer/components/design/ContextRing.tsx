/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tooltip } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

export type ContextRingProps = {
  /** Tokens currently in the context window. */
  used: number;
  /** Context window size in tokens; 0 or less renders an empty ring. */
  total: number;
  size?: number;
  className?: string;
};

/** Usage fraction clamped to 0–1. */
export function contextFraction(used: number, total: number): number {
  if (!(total > 0) || !(used > 0)) return 0;
  return Math.min(1, used / total);
}

/** Ring colour: accent, then needs-you above 80 %, failed above 95 %. */
export function contextRingColor(fraction: number): string {
  if (fraction > 0.95) return 'var(--wm-status-failed)';
  if (fraction > 0.8) return 'var(--wm-status-needs-you)';
  return 'var(--wm-accent)';
}

/** Small ring showing how full the model's context window is. */
const ContextRing: React.FC<ContextRingProps> = ({ used, total, size = 16, className }) => {
  const { t } = useTranslation();
  const fraction = contextFraction(used, total);
  const percent = Math.round(fraction * 100);
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const label = t('common.designSystem.contextUsage', { percent });
  return (
    <Tooltip content={label} mini>
      <span
        role='img'
        aria-label={label}
        data-percent={percent}
        className={['inline-flex shrink-0', className].filter(Boolean).join(' ')}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden='true'>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill='none'
            stroke='var(--wm-border-default)'
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill='none'
            stroke={contextRingColor(fraction)}
            strokeWidth={stroke}
            strokeLinecap='round'
            strokeDasharray={`${circumference * fraction} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
      </span>
    </Tooltip>
  );
};

export default ContextRing;
