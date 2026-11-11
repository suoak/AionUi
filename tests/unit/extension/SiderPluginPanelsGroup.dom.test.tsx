/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const catalog = vi.hoisted(() => ({
  current: {
    panels: [] as Array<{
      extensionName: string;
      id: string;
      title: string;
      entryPoint: string;
    }>,
    views: [] as Array<{
      extensionName: string;
      id: string;
      title: string;
      entryPoint: string;
      placement?: string;
    }>,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: () => undefined,
}));

vi.mock('@/renderer/hooks/system/useExtensionPanelCatalog', () => ({
  useExtensionPanelCatalog: () => catalog.current,
}));

import SiderPluginPanelsGroup from '@/renderer/components/layout/Sider/SiderPluginPanelsGroup';
import {
  ExtensionPanelSessionProvider,
  useExtensionPanelSession,
} from '@/renderer/hooks/system/ExtensionPanelSessionContext';

const tooltipProps = { trigger: 'hover' as const };

beforeEach(() => {
  catalog.current = { panels: [], views: [] };
});
afterEach(() => cleanup());

const renderGroup = (collapsed = false) =>
  render(
    <ExtensionPanelSessionProvider>
      <SiderPluginPanelsGroup collapsed={collapsed} siderTooltipProps={tooltipProps} />
    </ExtensionPanelSessionProvider>
  );

describe('SiderPluginPanelsGroup', () => {
  it('renders nothing when the catalog is empty', () => {
    renderGroup();
    expect(screen.queryByTestId('sider-plugin-panels')).not.toBeInTheDocument();
  });

  it('lists standalone panels and sidebar-placed work views, not workspace-placed ones', () => {
    catalog.current = {
      panels: [
        {
          extensionName: 'hello',
          id: 'ext-hello-board',
          title: 'Board',
          entryPoint: '/api/extensions/hello/assets/board.html',
        },
      ],
      views: [
        {
          extensionName: 'hello',
          id: 'ext-hello-nav',
          title: 'Nav',
          entryPoint: '/api/extensions/hello/assets/nav.html',
          placement: 'sidebar',
        },
        {
          extensionName: 'hello',
          id: 'ext-hello-work',
          title: 'Work',
          entryPoint: '/api/extensions/hello/assets/work.html',
          placement: 'secondary',
        },
      ],
    };
    renderGroup();
    expect(screen.getByTestId('sider-plugin-panels')).toBeInTheDocument();
    expect(screen.getByText('Plugin panels')).toBeInTheDocument();
    expect(screen.getByTestId('sider-plugin-panel-ext-hello-board')).toHaveTextContent('Board');
    expect(screen.getByTestId('sider-plugin-panel-ext-hello-nav')).toHaveTextContent('Nav');
    expect(screen.queryByTestId('sider-plugin-panel-ext-hello-work')).not.toBeInTheDocument();
  });

  it('opens a standalone panel in the session workspace when clicked', () => {
    catalog.current = {
      panels: [
        {
          extensionName: 'hello',
          id: 'ext-hello-board',
          title: 'Board',
          entryPoint: '/api/extensions/hello/assets/board.html',
        },
      ],
      views: [],
    };

    const Probe = () => {
      const { workspaceTabs, activeWorkspaceTabId } = useExtensionPanelSession();
      return (
        <div data-testid='probe'>
          {activeWorkspaceTabId}:{workspaceTabs.map((t) => t.id).join(',')}
        </div>
      );
    };

    render(
      <ExtensionPanelSessionProvider>
        <SiderPluginPanelsGroup collapsed={false} siderTooltipProps={tooltipProps} />
        <Probe />
      </ExtensionPanelSessionProvider>
    );
    expect(screen.getByTestId('probe')).toHaveTextContent(':');
    fireEvent.click(screen.getByTestId('sider-plugin-panel-ext-hello-board'));
    expect(screen.getByTestId('probe')).toHaveTextContent('ext-hello-board:ext-hello-board');
  });
});
