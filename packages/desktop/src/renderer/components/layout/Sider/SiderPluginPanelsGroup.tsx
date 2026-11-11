/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tooltip } from '@arco-design/web-react';
import { ApplicationOne } from '@icon-park/react';
import classNames from 'classnames';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { cleanupSiderTooltips } from '@renderer/utils/ui/siderTooltip';
import { useExtensionPanelSession } from '@/renderer/hooks/system/ExtensionPanelSessionContext';
import type { ExtensionPanelEntry } from '@/renderer/hooks/system/extensionPanelCatalog';

type SiderPluginPanelsGroupProps = {
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
};

const EXPANDED_KEY = 'plugin-panels-section-expanded';

const entryRow = (
  entry: ExtensionPanelEntry,
  opts: {
    collapsed: boolean;
    isActive: boolean;
    tooltipProps: SiderTooltipProps;
    onOpen: (id: string) => void;
  }
) => {
  const icon = (
    <ApplicationOne
      theme='outline'
      size={opts.collapsed ? 20 : 16}
      fill='currentColor'
      className='block leading-none'
    />
  );

  if (opts.collapsed) {
    return (
      <Tooltip key={entry.id} {...opts.tooltipProps} content={entry.title} position='right'>
        <button
          type='button'
          data-testid={`sider-plugin-panel-${entry.id}`}
          data-panel-id={entry.id}
          aria-label={entry.title}
          className={classNames(
            'w-full h-34px flex items-center justify-center cursor-pointer transition-colors rd-8px text-t-primary border-0 bg-transparent p-0',
            opts.isActive ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
          )}
          onClick={() => opts.onOpen(entry.id)}
        >
          {icon}
        </button>
      </Tooltip>
    );
  }

  return (
    <Tooltip key={entry.id} {...opts.tooltipProps} content={entry.title} position='right'>
      <button
        type='button'
        data-testid={`sider-plugin-panel-${entry.id}`}
        data-panel-id={entry.id}
        className={classNames(
          'box-border h-34px w-full flex items-center justify-start gap-8px pl-10px pr-8px rd-0.5rem cursor-pointer shrink-0 transition-all text-t-primary border-0 bg-transparent',
          opts.isActive ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
        )}
        onClick={() => opts.onOpen(entry.id)}
      >
        <span className='size-22px flex items-center justify-center shrink-0 text-t-primary'>{icon}</span>
        <span className='collapsed-hidden text-t-primary text-14px font-[500] leading-24px truncate'>
          {entry.title}
        </span>
      </button>
    </Tooltip>
  );
};

/**
 * Secondary sider group for plugin panels. Lists every standalone panel and
 * every work-panel view whose placement is sidebar-like. Clicking an entry
 * opens it in the session workspace (next to preview / explorer). Hidden when
 * the catalog is empty so the IA-1 five primary nav keys stay untouched.
 */
const SiderPluginPanelsGroup: React.FC<SiderPluginPanelsGroupProps> = ({ collapsed, siderTooltipProps }) => {
  const { t } = useTranslation();
  const { sidebarEntries, activeWorkspaceTabId, openPanel } = useExtensionPanelSession();
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(EXPANDED_KEY) !== 'false';
  });

  if (sidebarEntries.length === 0) return null;

  const onOpen = (id: string) => {
    cleanupSiderTooltips();
    openPanel(id);
  };

  const title = t('common.extensionPanels.groupTitle', 'Plugin panels');

  if (collapsed) {
    return (
      <div className='shrink-0 flex flex-col gap-2px' data-testid='sider-plugin-panels'>
        {sidebarEntries.map((entry) =>
          entryRow(entry, {
            collapsed: true,
            isActive: entry.id === activeWorkspaceTabId,
            tooltipProps: siderTooltipProps,
            onOpen,
          })
        )}
      </div>
    );
  }

  return (
    <div className='shrink-0 flex flex-col gap-2px px-4px' data-testid='sider-plugin-panels'>
      <button
        type='button'
        className='box-border h-28px w-full flex items-center gap-6px pl-10px pr-8px text-t-secondary text-12px font-[500] border-0 bg-transparent cursor-pointer hover:text-t-primary'
        aria-expanded={expanded}
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          try {
            localStorage.setItem(EXPANDED_KEY, String(next));
          } catch {
            // ignore
          }
        }}
      >
        <span className='truncate'>{title}</span>
      </button>
      {expanded &&
        sidebarEntries.map((entry) =>
          entryRow(entry, {
            collapsed: false,
            isActive: entry.id === activeWorkspaceTabId,
            tooltipProps: siderTooltipProps,
            onOpen,
          })
        )}
    </div>
  );
};

export default SiderPluginPanelsGroup;
