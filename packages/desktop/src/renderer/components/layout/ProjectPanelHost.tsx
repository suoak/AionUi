/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Layout-level session workspace host. This is the right-side panel column: it
 * owns the column's width, border and lifecycle, and mounts project or plugin
 * surfaces inside.
 *
 * Historically this hosted only the Explorer ({@link ExplorerContainer}) for a
 * bound project. It now also hosts extension work-panel views (honoring
 * placement) and standalone plugin panels the user opened from the sidebar,
 * so those contributions sit next to preview / the project explorer in the
 * conversation layout. When a plugin tab is selected the Explorer stays
 * mounted (hidden) so tree and WS state survive the switch, matching collapse.
 *
 * Seam for the explorer: the host still passes only `projectId` down. Plugin
 * frames load through the verified asset-token channel in
 * {@link ExtensionPanelFrame}.
 *
 * Rendered as a sibling of the route `<Outlet>`, above the per-conversation
 * subtree, so switching conversations within the same project does NOT remount it
 * — WS subscriptions, tree and preview stay live (no teardown, no flicker).
 * Collapsing shrinks the column to width 0 (kept mounted) rather than
 * unmounting, so collapse/expand also preserves state. `data-mount-id` (once per
 * mount) is the live-test proof it is not remounted across switches or collapse.
 */

import { Button } from '@arco-design/web-react';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { ExtensionPanelFrame } from '@/renderer/components/extensions/ExtensionPanelFrame';
import {
  SESSION_WORKSPACE_FILES_TAB_ID,
  useExtensionPanelSession,
} from '@/renderer/hooks/system/ExtensionPanelSessionContext';
import { ExplorerContainer } from '@/renderer/pages/conversation/explorer/ExplorerContainer';
import { useCurrentProject } from '@/renderer/pages/conversation/explorer/currentProjectStore';

export type ProjectPanelHostProps = {
  /** Rendered width in px (clamped by Layout against the chat+preview reserve). */
  widthPx: number;
  /** Collapsed → width 0, component kept mounted (no remount). */
  collapsed: boolean;
  /** Left-edge resize handle from Layout's `useResizableSplit`. */
  dragHandle?: React.ReactNode;
};

export const ProjectPanelHost: React.FC<ProjectPanelHostProps> = ({ widthPx, collapsed, dragHandle }) => {
  const { t } = useTranslation();
  const projectId = useCurrentProject();
  const { workspaceTabs, activeWorkspaceTabId, setActiveWorkspaceTab, closeOpenedPanel } = useExtensionPanelSession();
  const mountIdRef = useRef<string>('');
  if (mountIdRef.current === '') mountIdRef.current = `pec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const hasFiles = Boolean(projectId);
  const hasPluginTabs = workspaceTabs.length > 0;
  const showTabBar = hasFiles && hasPluginTabs;

  // Default to Files when a project is bound and the user has not picked a plugin tab.
  // Without a project, the first workspace tab is active on first paint (no effect flash).
  const pluginTabActive = Boolean(activeWorkspaceTabId && workspaceTabs.some((tab) => tab.id === activeWorkspaceTabId));
  const filesActive = hasFiles && (!pluginTabActive || !hasPluginTabs);
  const activePluginId = pluginTabActive ? activeWorkspaceTabId : filesActive ? null : (workspaceTabs[0]?.id ?? null);

  // No active project and no plugin workspace tabs → no host (legacy gating).
  if (!hasFiles && !hasPluginTabs) return null;

  return (
    <div
      data-project-panel-host
      data-explorer-column
      data-session-workspace
      data-mount-id={mountIdRef.current}
      data-collapsed={collapsed ? 'true' : 'false'}
      className='!bg-1 h-full flex-shrink-0 overflow-hidden relative'
      style={{
        width: collapsed ? '0px' : `${widthPx}px`,
        borderLeft: collapsed ? 'none' : '1px solid var(--bg-3)',
      }}
    >
      {!collapsed && dragHandle}
      <div className='h-full flex flex-col min-h-0'>
        {(showTabBar || (!hasFiles && hasPluginTabs)) && (
          <div
            className='flex items-center gap-4px ps-12px pe-8px py-4px flex-shrink-0 border-b border-[var(--bg-3)]'
            data-testid='session-plugin-workspace-tabs'
          >
            <div className='flex items-center gap-2px overflow-x-auto flex-1 min-w-0'>
              {hasFiles && (
                <Button
                  type='text'
                  size='small'
                  className={`flex-shrink-0 !px-8px ${filesActive ? '!text-t-primary !font-medium !bg-2' : '!text-t-secondary'}`}
                  data-testid='session-workspace-tab-files'
                  onClick={() => setActiveWorkspaceTab(SESSION_WORKSPACE_FILES_TAB_ID)}
                >
                  {t('conversation.explorer.tabs.files')}
                </Button>
              )}
              {workspaceTabs.map((tab) => {
                const isActive = tab.id === activePluginId;
                // Closable = opened from the sidebar (not a placement-pinned workspace view).
                const canClose = tab.kind === 'panel' || (tab.kind === 'work-panel-view' && !isWorkspacePinned(tab));
                return (
                  <Button
                    key={tab.id}
                    type='text'
                    size='small'
                    className={`flex-shrink-0 !px-8px ${isActive ? '!text-t-primary !font-medium !bg-2' : '!text-t-secondary'}`}
                    data-testid={`session-workspace-tab-${tab.id}`}
                    onClick={() => setActiveWorkspaceTab(tab.id)}
                  >
                    {tab.title}
                    {canClose && isActive && (
                      <span
                        role='button'
                        tabIndex={0}
                        aria-label={t('common.extensionPanels.closeTab', 'Close panel')}
                        className='ms-4px text-12px opacity-70 hover:opacity-100'
                        data-testid={`session-workspace-tab-close-${tab.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          closeOpenedPanel(tab.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            closeOpenedPanel(tab.id);
                          }
                        }}
                      >
                        ×
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {hasFiles && (
          <div className='flex-1 min-h-0 overflow-hidden' hidden={!filesActive} data-testid='session-workspace-files'>
            <ExplorerContainer projectId={projectId as string} />
          </div>
        )}

        {workspaceTabs.map((tab) => {
          const isActive = tab.id === activePluginId;
          return (
            <div
              key={tab.id}
              className='flex-1 min-h-0 overflow-hidden'
              hidden={!isActive}
              data-testid={`session-workspace-panel-${tab.id}`}
            >
              <ExtensionPanelFrame
                id={tab.id}
                title={tab.title}
                extensionName={tab.extensionName}
                entryPoint={tab.entryPoint}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

function isWorkspacePinned(tab: { kind: string; placement?: string }): boolean {
  if (tab.kind !== 'work-panel-view') return false;
  const value = (tab.placement ?? '').trim().toLowerCase();
  // Sidebar-like placements were opened from the sider, so they are dismissible.
  return value !== 'sidebar' && value !== 'sider' && value !== 'primary' && value !== 'left';
}

export default ProjectPanelHost;
