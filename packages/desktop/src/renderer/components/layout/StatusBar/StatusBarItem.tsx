/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';

type StatusBarItemProps = {
  testId: string;
  tooltip?: string;
  ariaLabel?: string;
  onClick?: () => void;
  emphasis?: 'normal' | 'attention';
  children: React.ReactNode;
};

/** One 24px status bar cell. Clickable cells are text buttons; the rest are plain spans. */
const StatusBarItem: React.FC<StatusBarItemProps> = ({
  testId,
  tooltip,
  ariaLabel,
  onClick,
  emphasis = 'normal',
  children,
}) => {
  const className = classNames(
    'inline-flex h-20px items-center gap-4px rd-4px px-6px text-11px leading-20px whitespace-nowrap',
    emphasis === 'attention' ? 'text-wm-status-needs-you font-600' : 'text-wm-text-secondary'
  );
  const body = onClick ? (
    <Button
      type='text'
      size='mini'
      data-testid={testId}
      aria-label={ariaLabel}
      onClick={onClick}
      className={classNames(className, '!h-20px !px-6px !text-11px hover:!bg-fill-3', {
        '!text-wm-text-secondary': emphasis === 'normal',
        '!text-wm-status-needs-you': emphasis === 'attention',
      })}
    >
      {children}
    </Button>
  ) : (
    <span data-testid={testId} aria-label={ariaLabel} className={className}>
      {children}
    </span>
  );
  if (!tooltip) return body;
  return (
    <Tooltip content={tooltip} position='top' mini>
      {body}
    </Tooltip>
  );
};

export default StatusBarItem;
