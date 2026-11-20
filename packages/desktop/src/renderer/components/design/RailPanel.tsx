/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Badge, Button, Tooltip } from '@arco-design/web-react';
import type { Icon } from '@icon-park/react/es/runtime';
import React from 'react';
import WmIcon from './WmIcon';

export type RailItem = {
  key: string;
  icon: Icon;
  label: string;
  /** Count badge (0 hides it). */
  badge?: number;
};

export type RailPanelProps = {
  items: RailItem[];
  /** The open panel, or null when collapsed to the rail. */
  activeKey: string | null;
  /** Clicking the active item collapses the panel (null). */
  onChange: (key: string | null) => void;
  /** Panel content for `activeKey`. */
  children?: React.ReactNode;
  /** Panel width in px when open. */
  width?: number;
  className?: string;
};

/**
 * Right-hand icon rail with one collapsible panel (files, diff, preview, terminal…).
 * Uses logical borders so it mirrors correctly in RTL locales.
 */
const RailPanel: React.FC<RailPanelProps> = ({ items, activeKey, onChange, children, width = 320, className }) => {
  const open = activeKey !== null && items.some((item) => item.key === activeKey);
  return (
    <aside data-testid='wm-rail-panel' className={['flex h-full min-h-0', className].filter(Boolean).join(' ')}>
      {open && (
        <section
          data-testid='wm-rail-panel-content'
          className='h-full min-h-0 overflow-hidden bg-wm-panel border-0 border-solid border-s border-wm-border-subtle'
          style={{ width }}
        >
          {children}
        </section>
      )}
      <nav
        role='tablist'
        aria-orientation='vertical'
        className='flex flex-col items-center gap-4px w-40px py-8px bg-wm-panel border-0 border-solid border-s border-wm-border-subtle'
      >
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <Tooltip key={item.key} content={item.label} position='left' mini>
              <Badge count={item.badge ?? 0} dot={false} maxCount={99} offset={[-2, 2]}>
                <Button
                  type='text'
                  size='small'
                  role='tab'
                  aria-selected={active}
                  aria-label={item.label}
                  data-testid={`wm-rail-item-${item.key}`}
                  onClick={() => onChange(active ? null : item.key)}
                  className={active ? '!bg-wm-accent-subtle !text-wm-accent' : '!text-t-secondary'}
                  icon={<WmIcon icon={item.icon} />}
                />
              </Badge>
            </Tooltip>
          );
        })}
      </nav>
    </aside>
  );
};

export default RailPanel;
