/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const useExtensionAssetSessionUrl = vi.hoisted(() => vi.fn());
const useExtensionAssetProbe = vi.hoisted(() => vi.fn(() => ({ status: 'ready' as const })));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | { code?: string }) => {
      if (typeof opts === 'string') return opts;
      if (opts && typeof opts === 'object' && 'code' in opts && key.endsWith('supportCode')) {
        return `Code: ${opts.code}`;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/renderer/hooks/system/useExtensionAssetSessionUrl', () => ({
  useExtensionAssetSessionUrl,
}));

vi.mock('@/renderer/hooks/system/useExtensionAssetProbe', () => ({
  useExtensionAssetProbe,
}));

import { ExtensionPanelFrame } from '@/renderer/components/extensions/ExtensionPanelFrame';
import { EXTENSION_PANEL_IFRAME_SANDBOX } from '@/renderer/hooks/system/extensionPanelCatalog';

afterEach(() => {
  cleanup();
  useExtensionAssetSessionUrl.mockReset();
  useExtensionAssetProbe.mockReset();
  useExtensionAssetProbe.mockReturnValue({ status: 'ready' });
});

describe('ExtensionPanelFrame', () => {
  it('loads a local asset through the session URL in a scripts-only sandboxed iframe', () => {
    useExtensionAssetSessionUrl.mockReturnValue('http://core/api/extensions/demo/asset-session/tok/panels/board.html');
    render(
      <ExtensionPanelFrame
        id='ext-demo-board'
        title='Board'
        extensionName='demo'
        entryPoint='/api/extensions/demo/assets/panels/board.html'
      />
    );

    expect(useExtensionAssetSessionUrl).toHaveBeenCalledWith('/api/extensions/demo/assets/panels/board.html', 'demo');
    const iframe = screen.getByTestId('extension-panel-iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('sandbox')).toBe(EXTENSION_PANEL_IFRAME_SANDBOX);
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(iframe.getAttribute('src')).toBe('http://core/api/extensions/demo/asset-session/tok/panels/board.html');
    expect(iframe.getAttribute('title')).toBe('Board');
    expect(iframe.getAttribute('referrerpolicy') || iframe.referrerPolicy).toMatch(/no-referrer/);
  });

  it('does not install a host postMessage bridge', () => {
    useExtensionAssetSessionUrl.mockReturnValue('http://core/api/extensions/demo/asset-session/tok/board.html');
    const add = vi.spyOn(window, 'addEventListener');
    render(
      <ExtensionPanelFrame
        id='ext-demo-board'
        title='Board'
        extensionName='demo'
        entryPoint='/api/extensions/demo/assets/board.html'
      />
    );
    const messageListeners = add.mock.calls.filter((call) => call[0] === 'message');
    expect(messageListeners).toEqual([]);
    add.mockRestore();
  });

  it('refuses a remote entry that is not a verified extension asset', () => {
    render(
      <ExtensionPanelFrame
        id='ext-demo-remote'
        title='Remote'
        extensionName='demo'
        entryPoint='https://evil.example/panel.html'
      />
    );
    expect(useExtensionAssetSessionUrl).toHaveBeenCalledWith(undefined, 'demo');
    expect(screen.queryByTestId('extension-panel-iframe')).not.toBeInTheDocument();
    expect(screen.getByTestId('extension-panel-frame')).toHaveAttribute('data-panel-unavailable', 'true');
    expect(screen.getByTestId('extension-panel-frame').textContent).toMatch(/CSBU WorkMate/);
    expect(screen.getByTestId('extension-panel-frame').textContent).not.toMatch(/AionUi/i);
  });

  it('shows a friendly hint and the raw code when the asset probe is refused', () => {
    useExtensionAssetSessionUrl.mockReturnValue('http://core/api/extensions/demo/asset-session/tok/panels/board.html');
    useExtensionAssetProbe.mockReturnValue({
      status: 'refused',
      raw: 'Extension asset refused: verified_asset_integrity_mismatch',
    });
    render(
      <ExtensionPanelFrame
        id='ext-demo-board'
        title='Board'
        extensionName='demo'
        entryPoint='/api/extensions/demo/assets/panels/board.html'
      />
    );
    expect(screen.queryByTestId('extension-panel-iframe')).not.toBeInTheDocument();
    expect(screen.getByTestId('extension-asset-refused')).toBeInTheDocument();
    expect(screen.getByTestId('extension-reason-hint').textContent).toBe(
      'common.extensionReasonCodes.verified_asset_integrity_mismatch'
    );
    expect(screen.getByTestId('extension-reason-code').textContent).toBe('Code: verified_asset_integrity_mismatch');
    expect(screen.getByTestId('extension-panel-frame').textContent).not.toMatch(/AionUi/i);
  });
});
