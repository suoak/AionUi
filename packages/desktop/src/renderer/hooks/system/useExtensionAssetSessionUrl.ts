/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { extensions as extensionsIpc } from '@/common/adapter/ipcBridge';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';

const ASSET_PATH = /^\/api\/extensions\/([^/?#]+)\/assets\/(.*)$/;

/**
 * Rewrite a backend extension asset path to its short-lived asset-session
 * form. Returns `null` when `url` is not a backend extension asset path.
 */
export function toAssetSessionPath(url: string, extensionName: string, basePath: string): string | null {
  const match = ASSET_PATH.exec(url);
  if (!match || decodeURIComponent(match[1]) !== extensionName) return null;
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return `${base}${match[2]}`;
}

/**
 * Settings-tab iframe URL backed by a short-lived, extension-scoped asset token
 * (E1 tail ④) instead of the caller's full credentials.
 *
 * Degrades for older aioncore without `/asset-token` (or any token error): the
 * legacy `/assets/` URL is used, exactly as before. External URLs and anything
 * that is not this extension's asset path pass through unchanged.
 *
 * Returns `undefined` while the token request is in flight so the iframe never
 * loads the legacy URL first.
 */
export function useExtensionAssetSessionUrl(
  url: string | undefined,
  extensionName: string | undefined
): string | undefined {
  const legacy = resolveExtensionAssetUrl(url) ?? url;
  const needsToken = !!url && !!extensionName && ASSET_PATH.test(url);
  const [resolved, setResolved] = useState<{ key: string; url: string } | null>(null);
  const key = `${extensionName ?? ''}|${url ?? ''}`;

  useEffect(() => {
    if (!needsToken || !url || !extensionName) return;
    let cancelled = false;
    void (async () => {
      let next = legacy ?? url;
      try {
        const issued = await extensionsIpc.issueAssetToken.invoke({ name: extensionName });
        const sessionPath = issued?.base_path ? toAssetSessionPath(url, extensionName, issued.base_path) : null;
        if (sessionPath) next = resolveExtensionAssetUrl(sessionPath) ?? sessionPath;
      } catch {
        // Older aioncore (no asset-token route) or transient error: legacy URL.
      }
      if (!cancelled) setResolved({ key, url: next });
    })();
    return () => {
      cancelled = true;
    };
  }, [needsToken, url, extensionName, legacy, key]);

  if (!needsToken) return legacy;
  return resolved?.key === key ? resolved.url : undefined;
}
