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

vi.mock('@/renderer/pages/conversation/explorer/ExplorerContainer', () => ({
  ExplorerContainer: ({ projectId }: { projectId: string }) => <div data-testid='explorer'>{projectId}</div>,
}));

vi.mock('@/renderer/hooks/system/useExtensionAssetSessionUrl', () => ({
  useExtensionAssetSessionUrl: (url?: string) =>
    url ? `http://core${url.replace('/assets/', '/asset-session/tok/')}` : undefined,
}));

vi.mock('@/renderer/hooks/system/useExtensionAssetProbe', () => ({
  useExtensionAssetProbe: (url?: string) => (url ? { status: 'ready' as const } : { status: 'idle' as const }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      if (key === 'conversation.explorer.tabs.files') return 'Files';
      return fallback ?? key;
    },
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/renderer/hooks/system/useExtensionPanelCatalog', () => ({
  useExtensionPanelCatalog: () => catalog.current,
}));

import { ProjectPanelHost } from '@/renderer/components/layout/ProjectPanelHost';
import {
  ExtensionPanelSessionProvider,
  useExtensionPanelSession,
} from '@/renderer/hooks/system/ExtensionPanelSessionContext';
import {
  resetCurrentProjectForTest,
  setCurrentProject,
} from '@/renderer/pages/conversation/explorer/currentProjectStore';

beforeEach(() => {
  resetCurrentProjectForTest();
  catalog.current = { panels: [], views: [] };
});
afterEach(() => cleanup());

const renderHost = () =>
  render(
    <ExtensionPanelSessionProvider>
      <ProjectPanelHost widthPx={280} collapsed={false} />
      <OpenBoardButton />
    </ExtensionPanelSessionProvider>
  );

const OpenBoardButton = () => {
  const { openPanel } = useExtensionPanelSession();
  return (
    <button type='button' data-testid='open-board' onClick={() => openPanel('ext-hello-board')}>
      open
    </button>
  );
};

describe('ProjectPanelHost plugin workspace', () => {
  it('still renders nothing when there is no project and no plugin tabs', () => {
    render(
      <ExtensionPanelSessionProvider>
        <ProjectPanelHost widthPx={260} collapsed={false} />
      </ExtensionPanelSessionProvider>
    );
    expect(document.querySelector('[data-explorer-column]')).toBeNull();
    expect(screen.queryByTestId('explorer')).not.toBeInTheDocument();
  });

  it('hosts a workspace-placed work-panel view without a project', () => {
    catalog.current = {
      panels: [],
      views: [
        {
          extensionName: 'hello',
          id: 'ext-hello-work',
          title: 'Work',
          entryPoint: '/api/extensions/hello/assets/work.html',
          placement: 'secondary',
        },
      ],
    };
    render(
      <ExtensionPanelSessionProvider>
        <ProjectPanelHost widthPx={280} collapsed={false} />
      </ExtensionPanelSessionProvider>
    );
    expect(document.querySelector('[data-session-workspace]')).not.toBeNull();
    expect(screen.getByTestId('session-workspace-tab-ext-hello-work')).toHaveTextContent('Work');
    expect(screen.getByTestId('session-workspace-panel-ext-hello-work')).toBeInTheDocument();
    expect(screen.queryByTestId('explorer')).not.toBeInTheDocument();
    const iframe = screen.getByTestId('extension-panel-iframe');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });

  it('keeps the Files explorer next to a plugin tab and does not unmount it when switching', () => {
    setCurrentProject('proj-9');
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
          id: 'ext-hello-work',
          title: 'Work',
          entryPoint: '/api/extensions/hello/assets/work.html',
          placement: 'secondary',
        },
      ],
    };
    renderHost();
    expect(screen.getByTestId('explorer')).toHaveTextContent('proj-9');
    expect(screen.getByTestId('session-workspace-tab-files')).toBeInTheDocument();
    expect(screen.getByTestId('session-workspace-files')).not.toHaveAttribute('hidden');

    fireEvent.click(screen.getByTestId('open-board'));
    expect(screen.getByTestId('session-workspace-panel-ext-hello-board')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('session-workspace-files')).toHaveAttribute('hidden');
    // Explorer stays mounted (hidden) so tree/WS state survive the switch.
    expect(screen.getByTestId('explorer')).toHaveTextContent('proj-9');

    fireEvent.click(screen.getByTestId('session-workspace-tab-files'));
    expect(screen.getByTestId('session-workspace-files')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('explorer')).toHaveTextContent('proj-9');
  });
});
