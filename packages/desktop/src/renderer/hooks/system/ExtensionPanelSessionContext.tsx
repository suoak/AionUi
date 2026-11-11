/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { IExtensionPanel, IExtensionWorkPanelView } from '@/common/adapter/ipcBridge';
import { partitionPanelCatalog, sessionWorkspaceTabs, type ExtensionPanelEntry } from './extensionPanelCatalog';

/** Reserved tab id for the project Files explorer in the session workspace column. */
export const SESSION_WORKSPACE_FILES_TAB_ID = 'workmate-files';
import { useExtensionPanelCatalog } from './useExtensionPanelCatalog';

export type ExtensionPanelSessionValue = {
  panels: IExtensionPanel[];
  views: IExtensionWorkPanelView[];
  sidebarEntries: ExtensionPanelEntry[];
  workspaceTabs: ExtensionPanelEntry[];
  activeWorkspaceTabId: string | null;
  /** True when the session-workspace column should appear even without a project. */
  workspaceColumnRequested: boolean;
  openPanel: (id: string) => void;
  setActiveWorkspaceTab: (id: string) => void;
  closeOpenedPanel: (id: string) => void;
};

const EMPTY_SESSION: ExtensionPanelSessionValue = {
  panels: [],
  views: [],
  sidebarEntries: [],
  workspaceTabs: [],
  activeWorkspaceTabId: null,
  workspaceColumnRequested: false,
  openPanel: () => undefined,
  setActiveWorkspaceTab: () => undefined,
  closeOpenedPanel: () => undefined,
};

const ExtensionPanelSessionContext = createContext<ExtensionPanelSessionValue>(EMPTY_SESSION);

export const ExtensionPanelSessionProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { panels, views } = useExtensionPanelCatalog();
  const [openSidebarId, setOpenSidebarId] = useState<string | null>(null);
  const [activeWorkspaceTabId, setActiveWorkspaceTabIdState] = useState<string | null>(null);

  const { sidebarEntries, workspaceEntries } = useMemo(() => partitionPanelCatalog(panels, views), [panels, views]);

  const workspaceTabs = useMemo(
    () => sessionWorkspaceTabs(workspaceEntries, sidebarEntries, openSidebarId),
    [workspaceEntries, sidebarEntries, openSidebarId]
  );

  const resolvedActiveId = useMemo(() => {
    if (activeWorkspaceTabId === SESSION_WORKSPACE_FILES_TAB_ID) {
      return activeWorkspaceTabId;
    }
    if (activeWorkspaceTabId && workspaceTabs.some((tab) => tab.id === activeWorkspaceTabId)) {
      return activeWorkspaceTabId;
    }
    // Leave unset so the host can default to Files when a project is bound.
    return null;
  }, [activeWorkspaceTabId, workspaceTabs]);

  const openPanel = useCallback((id: string) => {
    setOpenSidebarId(id);
    setActiveWorkspaceTabIdState(id);
  }, []);

  const setActiveWorkspaceTab = useCallback((id: string) => {
    setActiveWorkspaceTabIdState(id);
  }, []);

  const closeOpenedPanel = useCallback(
    (id: string) => {
      // Workspace-placed views stay in the column (they honor placement); only
      // sidebar-opened contributions can be dismissed from the workspace tabs.
      const isPinned = workspaceEntries.some((entry) => entry.id === id);
      if (isPinned) return;
      setOpenSidebarId((current) => (current === id ? null : current));
      setActiveWorkspaceTabIdState((current) => (current === id ? null : current));
    },
    [workspaceEntries]
  );

  const value = useMemo<ExtensionPanelSessionValue>(
    () => ({
      panels,
      views,
      sidebarEntries,
      workspaceTabs,
      activeWorkspaceTabId: resolvedActiveId,
      workspaceColumnRequested: workspaceTabs.length > 0,
      openPanel,
      setActiveWorkspaceTab,
      closeOpenedPanel,
    }),
    [panels, views, sidebarEntries, workspaceTabs, resolvedActiveId, openPanel, setActiveWorkspaceTab, closeOpenedPanel]
  );

  return <ExtensionPanelSessionContext.Provider value={value}>{children}</ExtensionPanelSessionContext.Provider>;
};

/**
 * Safe outside the provider (empty catalog, no-op actions) so existing Layout /
 * ProjectPanelHost tests keep working without a wrapper.
 */
export function useExtensionPanelSession(): ExtensionPanelSessionValue {
  return useContext(ExtensionPanelSessionContext);
}
