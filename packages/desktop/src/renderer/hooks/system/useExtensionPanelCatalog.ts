/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import {
  extensions as extensionsIpc,
  type IExtensionPanel,
  type IExtensionWorkPanelView,
} from '@/common/adapter/ipcBridge';

export type ExtensionPanelCatalog = {
  panels: IExtensionPanel[];
  views: IExtensionWorkPanelView[];
};

const EMPTY_CATALOG: ExtensionPanelCatalog = { panels: [], views: [] };

// Module-scope cache + single in-flight fetch, same shape as useExtensionSettingsTabs:
// many surfaces (sider, workspace host, tests) can subscribe without flooding Core.
let cachedCatalog: ExtensionPanelCatalog | null = null;
let inflight: Promise<ExtensionPanelCatalog> | null = null;
const subscribers = new Set<(catalog: ExtensionPanelCatalog) => void>();
let stateChangedUnsubscribe: (() => void) | null = null;

function notifySubscribers(catalog: ExtensionPanelCatalog): void {
  cachedCatalog = catalog;
  for (const listener of subscribers) {
    listener(catalog);
  }
}

function asList<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function fetchCatalog(): Promise<ExtensionPanelCatalog> {
  if (inflight) return inflight;
  inflight = Promise.all([
    extensionsIpc.getPanels
      .invoke()
      .then(asList)
      .catch((err) => {
        console.error('[useExtensionPanelCatalog] Failed to load panels:', err);
        return cachedCatalog?.panels ?? [];
      }),
    extensionsIpc.getWorkPanelViews
      .invoke()
      .then(asList)
      .catch((err) => {
        console.error('[useExtensionPanelCatalog] Failed to load work-panel views:', err);
        return cachedCatalog?.views ?? [];
      }),
  ])
    .then(([panels, views]) => {
      const catalog = { panels, views };
      notifySubscribers(catalog);
      return catalog;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function ensureStateListener(): void {
  if (stateChangedUnsubscribe) return;
  stateChangedUnsubscribe = extensionsIpc.stateChanged.on(() => {
    void fetchCatalog();
  });
}

/** Test-only: drop the module cache so isolated cases start empty. */
export function resetExtensionPanelCatalogForTest(): void {
  cachedCatalog = null;
  inflight = null;
  subscribers.clear();
  if (stateChangedUnsubscribe) {
    stateChangedUnsubscribe();
    stateChangedUnsubscribe = null;
  }
}

/**
 * Shared hook for extension panels and work-panel views.
 * One pair of requests per session, cached across consumers, refreshed on
 * extensions.state-changed.
 */
export function useExtensionPanelCatalog(): ExtensionPanelCatalog {
  const [catalog, setCatalog] = useState<ExtensionPanelCatalog>(() => cachedCatalog ?? EMPTY_CATALOG);

  useEffect(() => {
    subscribers.add(setCatalog);
    ensureStateListener();

    if (cachedCatalog === null) {
      void fetchCatalog();
    } else {
      setCatalog(cachedCatalog);
    }

    return () => {
      subscribers.delete(setCatalog);
    };
  }, []);

  return catalog;
}
