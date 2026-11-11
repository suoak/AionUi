/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IExtensionPanel, IExtensionWorkPanelView } from '@/common/adapter/ipcBridge';

export type ExtensionPanelKind = 'panel' | 'work-panel-view';

export type ExtensionPanelEntry = IExtensionPanel & {
  kind: ExtensionPanelKind;
  placement?: string;
};

export type WorkPanelSurface = 'sidebar' | 'workspace';

/**
 * v1 panel iframe sandbox. Opaque origin: scripts may run, but the frame must
 * not receive `allow-same-origin` (no DOM/cookie access to the host, no
 * `contentDocument` bridge) and must not be allowed to navigate the top window.
 */
export const EXTENSION_PANEL_IFRAME_SANDBOX = 'allow-scripts';

/** Work-panel `placement` → host surface. Unknown / empty / "secondary" land in the session workspace. */
export function workPanelPlacementSurface(placement: string | undefined): WorkPanelSurface {
  const value = (placement ?? '').trim().toLowerCase();
  if (value === 'sidebar' || value === 'sider' || value === 'primary' || value === 'left') {
    return 'sidebar';
  }
  return 'workspace';
}

/** True when the entry is a backend-served extension asset (the only v1 hostable source). */
export function isLocalExtensionAssetPath(url: string | undefined): boolean {
  return !!url && /^\/api\/extensions\/[^/?#]+\/assets\//.test(url);
}

/**
 * Partition the B3-filtered catalog:
 * - every standalone panel is a sidebar entry (and can later open in the workspace);
 * - work-panel views honor `placement` (sidebar-like vs session workspace).
 */
export function partitionPanelCatalog(
  panels: IExtensionPanel[],
  views: IExtensionWorkPanelView[]
): { sidebarEntries: ExtensionPanelEntry[]; workspaceEntries: ExtensionPanelEntry[] } {
  const sidebarEntries: ExtensionPanelEntry[] = panels.map((panel) => ({ ...panel, kind: 'panel' as const }));
  const workspaceEntries: ExtensionPanelEntry[] = [];
  for (const view of views) {
    const entry: ExtensionPanelEntry = { ...view, kind: 'work-panel-view' };
    if (workPanelPlacementSurface(view.placement) === 'sidebar') {
      sidebarEntries.push(entry);
    } else {
      workspaceEntries.push(entry);
    }
  }
  return { sidebarEntries, workspaceEntries };
}

/**
 * Session-workspace tabs: workspace-placed work-panel views, plus any sidebar
 * entry the user has opened (standalone panel or sidebar-placed work view).
 */
export function sessionWorkspaceTabs(
  workspaceEntries: ExtensionPanelEntry[],
  sidebarEntries: ExtensionPanelEntry[],
  openSidebarId: string | null
): ExtensionPanelEntry[] {
  const tabs = [...workspaceEntries];
  if (!openSidebarId) return tabs;
  if (tabs.some((tab) => tab.id === openSidebarId)) return tabs;
  const opened = sidebarEntries.find((entry) => entry.id === openSidebarId);
  if (opened) tabs.push(opened);
  return tabs;
}
