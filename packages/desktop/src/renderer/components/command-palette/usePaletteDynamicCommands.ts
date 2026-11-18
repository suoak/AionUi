/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import type { PaletteCommand } from './commandRegistry';
import { DYNAMIC_LOADERS, type DynamicLoaderContext, type DynamicSourceKey } from './dynamicCommands';

export type DynamicSourceStatus = 'idle' | 'loading' | 'ready' | 'error';

export type DynamicSourceState = {
  status: DynamicSourceStatus;
  commands: PaletteCommand[];
};

const SOURCE_KEYS: readonly DynamicSourceKey[] = ['sessions', 'workItems', 'files', 'agents', 'commands'];

/** Re-opening within this window reuses the last results (no refetch). */
export const PALETTE_DYNAMIC_TTL_MS = 30_000;

type CacheEntry = { at: number; commands: PaletteCommand[] };
const cache = new Map<string, CacheEntry>();

const cacheId = (key: DynamicSourceKey, workspace?: string): string =>
  key === 'files' ? `files:${workspace ?? ''}` : key;

/** Test hook: drop cached dynamic results. */
export function resetPaletteDynamicCache(): void {
  cache.clear();
}

const initialState = (): Record<DynamicSourceKey, DynamicSourceState> => {
  const out = {} as Record<DynamicSourceKey, DynamicSourceState>;
  for (const key of SOURCE_KEYS) {
    out[key] = { status: 'idle', commands: [] };
  }
  return out;
};

/**
 * Loads Sessions / Work items / Files / Agents / plugin commands each time the
 * palette opens. Sources load in parallel and independently: one slow or
 * failing bridge never blocks the static commands or the other groups. Results
 * are cached for a short TTL so rapid Cmd/Ctrl+K toggles stay instant; stale
 * cache stays visible while a refresh is in flight. The files cache is scoped
 * to the current conversation workspace.
 */
export function usePaletteDynamicCommands(open: boolean, enabled = true, ctx?: DynamicLoaderContext) {
  const workspace = ctx?.workspace;
  const [sources, setSources] = useState<Record<DynamicSourceKey, DynamicSourceState>>(initialState);

  useEffect(() => {
    if (!open || !enabled) return;
    let cancelled = false;
    const now = Date.now();
    for (const key of SOURCE_KEYS) {
      const id = cacheId(key, workspace);
      const hit = cache.get(id);
      if (hit && now - hit.at < PALETTE_DYNAMIC_TTL_MS) {
        setSources((prev) => ({ ...prev, [key]: { status: 'ready', commands: hit.commands } }));
        continue;
      }
      setSources((prev) => ({
        ...prev,
        [key]: { status: hit ? 'ready' : 'loading', commands: hit?.commands ?? (key === 'files' ? [] : prev[key].commands) },
      }));
      let promise: Promise<PaletteCommand[]>;
      try {
        promise = Promise.resolve(DYNAMIC_LOADERS[key]({ workspace }));
      } catch (error) {
        promise = Promise.reject(error);
      }
      promise.then(
        (commands) => {
          const list = Array.isArray(commands) ? commands : [];
          cache.set(id, { at: Date.now(), commands: list });
          if (!cancelled) setSources((prev) => ({ ...prev, [key]: { status: 'ready', commands: list } }));
        },
        (error: unknown) => {
          console.warn(`[command-palette] ${key} unavailable`, error);
          if (!cancelled) {
            setSources((prev) => ({
              ...prev,
              [key]: { status: prev[key].commands.length > 0 ? 'ready' : 'error', commands: prev[key].commands },
            }));
          }
        }
      );
    }
    return () => {
      cancelled = true;
    };
  }, [open, enabled, workspace]);

  const commands = useMemo(() => SOURCE_KEYS.flatMap((key) => sources[key].commands), [sources]);
  return { commands, sources };
}
