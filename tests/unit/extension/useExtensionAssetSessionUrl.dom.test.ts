/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * E1 tail ④: settings-tab iframe uses a short-lived asset-session URL and
 * degrades to the legacy /assets/ URL against older aioncore.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const issueAssetToken = vi.hoisted(() => vi.fn());

vi.mock('@/common/adapter/ipcBridge', () => ({
  extensions: { issueAssetToken: { invoke: issueAssetToken } },
}));
vi.mock('@/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: (url: string | undefined) => (url?.startsWith('/') ? `http://core${url}` : url),
}));

import { toAssetSessionPath, useExtensionAssetSessionUrl } from '@/renderer/hooks/system/useExtensionAssetSessionUrl';

describe('toAssetSessionPath', () => {
  it('rewrites only this extension asset path', () => {
    expect(
      toAssetSessionPath(
        '/api/extensions/demo/assets/ui/index.html?x=1',
        'demo',
        '/api/extensions/demo/asset-session/t/'
      )
    ).toBe('/api/extensions/demo/asset-session/t/ui/index.html?x=1');
    expect(toAssetSessionPath('/api/extensions/other/assets/a.html', 'demo', '/b/')).toBeNull();
    expect(toAssetSessionPath('https://example.com/a.html', 'demo', '/b/')).toBeNull();
  });
});

describe('useExtensionAssetSessionUrl', () => {
  beforeEach(() => {
    issueAssetToken.mockReset();
  });

  it('uses the token URL once issued, nothing before', async () => {
    let release!: (v: unknown) => void;
    issueAssetToken.mockReturnValue(new Promise((r) => (release = r)));
    const { result } = renderHook(() => useExtensionAssetSessionUrl('/api/extensions/demo/assets/ui/s.html', 'demo'));
    expect(result.current).toBeUndefined();
    release({ token: 't', expires_at: 1, base_path: '/api/extensions/demo/asset-session/t/' });
    await waitFor(() => expect(result.current).toBe('http://core/api/extensions/demo/asset-session/t/ui/s.html'));
    expect(issueAssetToken).toHaveBeenCalledWith({ name: 'demo' });
  });

  it('falls back to the legacy URL when the core lacks the token route', async () => {
    // Older aioncore: no asset-token route.
    issueAssetToken.mockRejectedValue(new Error('Request failed: 404'));
    const { result } = renderHook(() => useExtensionAssetSessionUrl('/api/extensions/demo/assets/ui/s.html', 'demo'));
    await waitFor(() => expect(result.current).toBe('http://core/api/extensions/demo/assets/ui/s.html'));
  });

  it('passes external URLs through without requesting a token', () => {
    const { result } = renderHook(() => useExtensionAssetSessionUrl('https://example.com/s.html', 'demo'));
    expect(result.current).toBe('https://example.com/s.html');
    expect(issueAssetToken).not.toHaveBeenCalled();
  });
});
