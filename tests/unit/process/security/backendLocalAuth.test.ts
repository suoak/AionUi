/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

import {
  installBackendLocalAuth,
  shouldAttachLocalSecret,
  type LocalSecretRequest,
} from '@process/security/backendLocalAuth';

const PORT = 25901;
const ctx = {
  backendPort: PORT,
  trustedRendererPrefixes: ['file:///Applications/CSBU%20WorkMate.app/Contents/Resources/app/out/renderer/'],
};
const APP_URL = 'file:///Applications/CSBU%20WorkMate.app/Contents/Resources/app/out/renderer/index.html#/guid';

function req(overrides: Partial<LocalSecretRequest>): LocalSecretRequest {
  return {
    url: `http://127.0.0.1:${PORT}/api/conversations`,
    method: 'GET',
    resourceType: 'xhr',
    webContentsType: 'window',
    mainFrameUrl: APP_URL,
    isMainFrame: true,
    frameOrigin: 'file://',
    mainFrameOrigin: 'file://',
    ...overrides,
  };
}

describe('shouldAttachLocalSecret', () => {
  it('attaches for the app renderer main frame (fetch, image, websocket)', () => {
    expect(shouldAttachLocalSecret(req({}), ctx)).toBe(true);
    expect(shouldAttachLocalSecret(req({ resourceType: 'image', url: `http://127.0.0.1:${PORT}/api/fs/x` }), ctx)).toBe(
      true
    );
    expect(shouldAttachLocalSecret(req({ resourceType: 'webSocket', url: `ws://127.0.0.1:${PORT}/ws` }), ctx)).toBe(
      true
    );
  });

  it('matches renderer prefixes case-insensitively (Windows drive letters)', () => {
    const winCtx = { backendPort: PORT, trustedRendererPrefixes: ['file:///C:/Program%20Files/WorkMate/renderer/'] };
    expect(
      shouldAttachLocalSecret(req({ mainFrameUrl: 'file:///c:/Program Files/WorkMate/renderer/index.html' }), winCtx)
    ).toBe(true);
  });

  it('never attaches to other hosts or ports', () => {
    expect(shouldAttachLocalSecret(req({ url: 'http://127.0.0.1:9999/api/conversations' }), ctx)).toBe(false);
    expect(shouldAttachLocalSecret(req({ url: `http://evil.example:${PORT}/api` }), ctx)).toBe(false);
    expect(shouldAttachLocalSecret(req({ url: `https://127.0.0.1:${PORT}/api` }), ctx)).toBe(false);
    expect(shouldAttachLocalSecret(req({}), { ...ctx, backendPort: 0 })).toBe(false);
  });

  it('refuses windows that are not showing the app renderer (OAuth / remote pages)', () => {
    expect(shouldAttachLocalSecret(req({ mainFrameUrl: 'https://accounts.example.com/login' }), ctx)).toBe(false);
    expect(shouldAttachLocalSecret(req({ mainFrameUrl: 'file:///tmp/evil.html' }), ctx)).toBe(false);
    expect(shouldAttachLocalSecret(req({ mainFrameUrl: undefined }), ctx)).toBe(false);
  });

  it('refuses script requests from opaque or cross-origin child frames', () => {
    expect(
      shouldAttachLocalSecret(req({ isMainFrame: false, frameOrigin: 'null', mainFrameOrigin: 'null' }), ctx)
    ).toBe(false);
    expect(shouldAttachLocalSecret(req({ isMainFrame: false, frameOrigin: `http://127.0.0.1:${PORT}` }), ctx)).toBe(
      false
    );
    expect(
      shouldAttachLocalSecret(
        req({ isMainFrame: false, frameOrigin: 'null', method: 'POST', resourceType: 'subFrame' }),
        ctx
      )
    ).toBe(false);
  });

  it('allows same-origin child frames and GET iframe documents embedded by the renderer', () => {
    expect(shouldAttachLocalSecret(req({ isMainFrame: false }), ctx)).toBe(true);
    expect(
      shouldAttachLocalSecret(req({ isMainFrame: false, frameOrigin: 'null', resourceType: 'subFrame' }), ctx)
    ).toBe(true);
  });

  it('webviews only get the file byte stream, never script-initiated requests', () => {
    const stream = `http://127.0.0.1:${PORT}/api/fs/stream?kind=upload&path=%2Ftmp%2Fa.pdf`;
    const webview = { webContentsType: 'webview', mainFrameUrl: stream, isMainFrame: true };
    expect(shouldAttachLocalSecret(req({ ...webview, url: stream, resourceType: 'mainFrame' }), ctx)).toBe(true);
    expect(shouldAttachLocalSecret(req({ ...webview, url: stream, resourceType: 'other' }), ctx)).toBe(true);
    expect(shouldAttachLocalSecret(req({ ...webview, url: stream, resourceType: 'xhr' }), ctx)).toBe(false);
    expect(
      shouldAttachLocalSecret(req({ ...webview, url: stream, method: 'POST', resourceType: 'mainFrame' }), ctx)
    ).toBe(false);
    expect(shouldAttachLocalSecret(req({ ...webview, resourceType: 'mainFrame' }), ctx)).toBe(false);
  });

  it('ignores unknown webContents types', () => {
    expect(shouldAttachLocalSecret(req({ webContentsType: 'backgroundPage' }), ctx)).toBe(false);
    expect(shouldAttachLocalSecret(req({ webContentsType: undefined }), ctx)).toBe(false);
  });
});

describe('installBackendLocalAuth', () => {
  type Listener = (
    details: Record<string, unknown>,
    callback: (response: { requestHeaders: Record<string, string> }) => void
  ) => void;

  function install(secret: string | null) {
    let listener: Listener | undefined;
    const session = {
      webRequest: {
        onBeforeSendHeaders: vi.fn((_filter: unknown, fn: Listener) => {
          listener = fn;
        }),
      },
    };
    installBackendLocalAuth(session as never, {
      getBackendPort: () => PORT,
      getLocalSecret: () => secret,
      trustedRendererPrefixes: ctx.trustedRendererPrefixes,
    });
    const mainFrame = { processId: 1, routingId: 1, origin: 'file://', url: APP_URL };
    const run = (details: Record<string, unknown>) =>
      new Promise<Record<string, string>>((resolve) => {
        listener!(details, (response) => resolve(response.requestHeaders));
      });
    return { session, mainFrame, run };
  }

  it('injects the secret for app requests and strips smuggled values elsewhere', async () => {
    const { mainFrame, run } = install('s3cret-value');
    const webContents = { isDestroyed: () => false, getType: () => 'window', mainFrame };

    const appHeaders = await run({
      url: `http://127.0.0.1:${PORT}/api/settings`,
      method: 'GET',
      resourceType: 'xhr',
      webContents,
      frame: mainFrame,
      requestHeaders: { Accept: 'application/json' },
    });
    expect(appHeaders['x-aionui-local-secret']).toBe('s3cret-value');
    expect(appHeaders.Accept).toBe('application/json');

    const foreignFrame = { processId: 2, routingId: 7, origin: 'null', url: 'about:srcdoc' };
    const foreignHeaders = await run({
      url: `http://127.0.0.1:${PORT}/api/settings`,
      method: 'GET',
      resourceType: 'xhr',
      webContents,
      frame: foreignFrame,
      requestHeaders: { 'X-AionUi-Local-Secret': 'guess' },
    });
    expect(foreignHeaders['x-aionui-local-secret']).toBeUndefined();
    expect(foreignHeaders['X-AionUi-Local-Secret']).toBeUndefined();
  });

  it('does nothing when the backend runs without a secret', async () => {
    const { mainFrame, run } = install(null);
    const headers = await run({
      url: `http://127.0.0.1:${PORT}/api/settings`,
      method: 'GET',
      resourceType: 'xhr',
      webContents: { isDestroyed: () => false, getType: () => 'window', mainFrame },
      frame: mainFrame,
      requestHeaders: {},
    });
    expect(headers).toEqual({});
  });
});
