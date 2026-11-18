/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import type { Icon } from '@icon-park/react/es/runtime';
import React from 'react';
import WmIcon from './WmIcon';

export type EmptyStateAction = {
  label: string;
  onClick: () => void;
};

export type EmptyStateProps = {
  icon?: Icon;
  title: string;
  /** One sentence explaining what will appear here, or what to do next. */
  description?: string;
  /** The single primary action; pass a node for anything custom. */
  action?: EmptyStateAction | React.ReactNode;
  /** `compact` for panels and lists, `default` for full pages. */
  size?: 'default' | 'compact';
  className?: string;
  'data-testid'?: string;
};

const isAction = (value: unknown): value is EmptyStateAction =>
  typeof value === 'object' && value !== null && 'label' in value && 'onClick' in value;

/** Icon + title + one sentence + one primary action. Replaces bare Arco `<Empty>`. */
const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  size = 'default',
  className,
  'data-testid': testId,
}) => {
  const compact = size === 'compact';
  return (
    <div
      data-testid={testId ?? 'wm-empty-state'}
      className={[
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-6px py-24px px-16px' : 'gap-8px py-48px px-24px',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon && (
        <span
          className={[
            'flex items-center justify-center rd-[var(--wm-radius-card)] bg-wm-accent-subtle text-wm-accent',
            compact ? 'w-32px h-32px mb-2px' : 'w-44px h-44px mb-4px',
          ].join(' ')}
        >
          <WmIcon icon={icon} size={compact ? 16 : 20} />
        </span>
      )}
      <div className={compact ? 'text-13px font-medium text-t-primary' : 'text-16px font-medium text-t-primary'}>
        {title}
      </div>
      {description && <div className='max-w-360px text-13px leading-20px text-t-secondary'>{description}</div>}
      {action && (
        <div className={compact ? 'mt-4px' : 'mt-8px'}>
          {isAction(action) ? (
            <Button type='primary' size={compact ? 'small' : 'default'} onClick={action.onClick}>
              {action.label}
            </Button>
          ) : (
            action
          )}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
