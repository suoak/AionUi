/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { collectErrorText } from '@/renderer/extensions/reasonCodes';

export type ExtensionAssetProbe =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'refused'; raw: string };

async function readRefusalText(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const json = JSON.parse(text) as unknown;
    const collected = collectErrorText(json);
    return collected || text || `HTTP ${response.status}`;
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

/**
 * Probe a resolved extension asset URL before/alongside the iframe so a 403
 * refusal can be shown as a friendly hint instead of a raw error document.
 */
export function useExtensionAssetProbe(url: string | undefined): ExtensionAssetProbe {
  const [state, setState] = useState<ExtensionAssetProbe>(url ? { status: 'loading' } : { status: 'idle' });

  useEffect(() => {
    if (!url) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    void (async () => {
      try {
        const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
        if (cancelled) return;
        if (response.ok) {
          setState({ status: 'ready' });
          return;
        }
        setState({ status: 'refused', raw: await readRefusalText(response) });
      } catch (error) {
        if (!cancelled) {
          setState({ status: 'refused', raw: collectErrorText(error) || String(error) });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
