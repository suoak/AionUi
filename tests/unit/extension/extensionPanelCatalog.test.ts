/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IExtensionPanel, IExtensionWorkPanelView } from '@/common/adapter/ipcBridge';
import {
  EXTENSION_PANEL_IFRAME_SANDBOX,
  isLocalExtensionAssetPath,
  partitionPanelCatalog,
  sessionWorkspaceTabs,
  workPanelPlacementSurface,
} from '@/renderer/hooks/system/extensionPanelCatalog';

const panel = (id: string, title = id): IExtensionPanel => ({
  extensionName: 'demo',
  id,
  title,
  entryPoint: `/api/extensions/demo/assets/${id}.html`,
});

const view = (id: string, placement?: string): IExtensionWorkPanelView => ({
  ...panel(id),
  placement,
});

describe('workPanelPlacementSurface', () => {
  it('maps sidebar-like values to the left sider', () => {
    expect(workPanelPlacementSurface('sidebar')).toBe('sidebar');
    expect(workPanelPlacementSurface('Sider')).toBe('sidebar');
    expect(workPanelPlacementSurface(' primary ')).toBe('sidebar');
    expect(workPanelPlacementSurface('left')).toBe('sidebar');
  });

  it('sends secondary, workspace, empty, and unknown placement to the session workspace', () => {
    expect(workPanelPlacementSurface('secondary')).toBe('workspace');
    expect(workPanelPlacementSurface('workspace')).toBe('workspace');
    expect(workPanelPlacementSurface('session')).toBe('workspace');
    expect(workPanelPlacementSurface(undefined)).toBe('workspace');
    expect(workPanelPlacementSurface('')).toBe('workspace');
    expect(workPanelPlacementSurface('something-new')).toBe('workspace');
  });
});

describe('isLocalExtensionAssetPath', () => {
  it('accepts only backend extension asset paths', () => {
    expect(isLocalExtensionAssetPath('/api/extensions/demo/assets/panels/board.html')).toBe(true);
    expect(isLocalExtensionAssetPath('https://example.com/board.html')).toBe(false);
    expect(isLocalExtensionAssetPath('/api/extensions/demo/asset-session/t/x.html')).toBe(false);
    expect(isLocalExtensionAssetPath(undefined)).toBe(false);
  });
});

describe('partitionPanelCatalog', () => {
  it('puts every standalone panel in the sidebar and honors work-panel placement', () => {
    const { sidebarEntries, workspaceEntries } = partitionPanelCatalog(
      [panel('ext-demo-board', 'Board')],
      [view('ext-demo-side', 'sidebar'), view('ext-demo-work', 'secondary')]
    );
    expect(sidebarEntries.map((e) => e.id)).toEqual(['ext-demo-board', 'ext-demo-side']);
    expect(sidebarEntries.map((e) => e.kind)).toEqual(['panel', 'work-panel-view']);
    expect(workspaceEntries.map((e) => e.id)).toEqual(['ext-demo-work']);
    expect(workspaceEntries[0].kind).toBe('work-panel-view');
  });
});

describe('sessionWorkspaceTabs', () => {
  it('includes workspace-placed views and any sidebar entry the user opened', () => {
    const { sidebarEntries, workspaceEntries } = partitionPanelCatalog(
      [panel('ext-demo-board', 'Board')],
      [view('ext-demo-side', 'sidebar'), view('ext-demo-work', 'secondary')]
    );
    expect(sessionWorkspaceTabs(workspaceEntries, sidebarEntries, null).map((e) => e.id)).toEqual(['ext-demo-work']);
    expect(sessionWorkspaceTabs(workspaceEntries, sidebarEntries, 'ext-demo-board').map((e) => e.id)).toEqual([
      'ext-demo-work',
      'ext-demo-board',
    ]);
    expect(sessionWorkspaceTabs(workspaceEntries, sidebarEntries, 'ext-demo-side').map((e) => e.id)).toEqual([
      'ext-demo-work',
      'ext-demo-side',
    ]);
  });
});

describe('EXTENSION_PANEL_IFRAME_SANDBOX', () => {
  it('is scripts-only: no same-origin and no top navigation', () => {
    expect(EXTENSION_PANEL_IFRAME_SANDBOX).toBe('allow-scripts');
    expect(EXTENSION_PANEL_IFRAME_SANDBOX).not.toMatch(/same-origin/);
    expect(EXTENSION_PANEL_IFRAME_SANDBOX).not.toMatch(/allow-top-navigation/);
  });
});
