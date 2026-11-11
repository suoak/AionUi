/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getPanels = vi.hoisted(() => vi.fn());
const getWorkPanelViews = vi.hoisted(() => vi.fn());
const stateChangedOn = vi.hoisted(() => vi.fn());

vi.mock('@/common/adapter/ipcBridge', () => ({
  extensions: {
    getPanels: { invoke: getPanels },
    getWorkPanelViews: { invoke: getWorkPanelViews },
    stateChanged: { on: stateChangedOn },
  },
}));

import {
  resetExtensionPanelCatalogForTest,
  useExtensionPanelCatalog,
} from '@/renderer/hooks/system/useExtensionPanelCatalog';

const unsignedPanel = {
  extensionName: 'local.hello',
  id: 'ext-local.hello-board',
  title: 'Board',
  entryPoint: '/api/extensions/local.hello/assets/board.html',
};

const workView = {
  extensionName: 'local.hello',
  id: 'ext-local.hello-side',
  title: 'Side',
  entryPoint: '/api/extensions/local.hello/assets/side.html',
  placement: 'secondary',
};

describe('useExtensionPanelCatalog', () => {
  beforeEach(() => {
    resetExtensionPanelCatalogForTest();
    getPanels.mockReset();
    getWorkPanelViews.mockReset();
    stateChangedOn.mockReset();
    stateChangedOn.mockReturnValue(() => undefined);
    getPanels.mockResolvedValue([unsignedPanel]);
    getWorkPanelViews.mockResolvedValue([workView]);
  });

  afterEach(() => {
    resetExtensionPanelCatalogForTest();
  });

  it('loads unsigned-local fixtures through the existing B3 listing endpoints', async () => {
    const { result } = renderHook(() => useExtensionPanelCatalog());
    await waitFor(() => {
      expect(result.current.panels).toEqual([unsignedPanel]);
      expect(result.current.views).toEqual([workView]);
    });
    expect(getPanels).toHaveBeenCalledTimes(1);
    expect(getWorkPanelViews).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight fetch across subscribers and refreshes on state-changed', async () => {
    let onState: (() => void) | undefined;
    stateChangedOn.mockImplementation((cb: () => void) => {
      onState = cb;
      return () => undefined;
    });

    const first = renderHook(() => useExtensionPanelCatalog());
    const second = renderHook(() => useExtensionPanelCatalog());
    await waitFor(() => expect(first.result.current.panels).toHaveLength(1));
    expect(second.result.current.panels).toHaveLength(1);
    expect(getPanels).toHaveBeenCalledTimes(1);

    getPanels.mockResolvedValue([]);
    getWorkPanelViews.mockResolvedValue([]);
    onState?.();
    await waitFor(() => expect(first.result.current.panels).toEqual([]));
    expect(second.result.current.panels).toEqual([]);
    expect(getPanels).toHaveBeenCalledTimes(2);
  });

  it('keeps an empty catalog when listing fails (no production-signed pack required)', async () => {
    getPanels.mockRejectedValue(new Error('core offline'));
    getWorkPanelViews.mockRejectedValue(new Error('core offline'));
    const { result } = renderHook(() => useExtensionPanelCatalog());
    await waitFor(() => expect(getPanels).toHaveBeenCalled());
    expect(result.current.panels).toEqual([]);
    expect(result.current.views).toEqual([]);
  });
});
