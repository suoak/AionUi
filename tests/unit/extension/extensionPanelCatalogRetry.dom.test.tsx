/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getPanels = vi.hoisted(() => vi.fn());
const getWorkPanelViews = vi.hoisted(() => vi.fn());

vi.mock('@/common/adapter/ipcBridge', () => ({
  extensions: {
    getPanels: { invoke: getPanels },
    getWorkPanelViews: { invoke: getWorkPanelViews },
    stateChanged: { on: () => () => {} },
  },
}));

import {
  refreshExtensionPanelCatalogIfFailed,
  resetExtensionPanelCatalogForTest,
  useExtensionPanelCatalog,
} from '@/renderer/hooks/system/useExtensionPanelCatalog';

afterEach(() => {
  cleanup();
  resetExtensionPanelCatalogForTest();
  getPanels.mockReset();
  getWorkPanelViews.mockReset();
});

const panel = { id: 'p1', title: 'Shortcuts', extensionName: 'demo', entryPoint: '/x.html' };

describe('extension panel catalog after sign-in', () => {
  it('fetches again once signed in when the first fetch was refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getPanels.mockRejectedValueOnce(new Error('401')).mockResolvedValue([panel]);
    getWorkPanelViews.mockRejectedValueOnce(new Error('401')).mockResolvedValue([]);

    const { result } = renderHook(() => useExtensionPanelCatalog());
    await waitFor(() => expect(getPanels).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refreshExtensionPanelCatalogIfFailed()).not.toBeNull());

    await act(async () => {
      await refreshExtensionPanelCatalogIfFailed();
    });
    expect(result.current.panels).toEqual([panel]);
    expect(refreshExtensionPanelCatalogIfFailed()).toBeNull();
  });

  it('does not fetch again after a successful load', async () => {
    getPanels.mockResolvedValue([panel]);
    getWorkPanelViews.mockResolvedValue([]);
    const { result } = renderHook(() => useExtensionPanelCatalog());
    await waitFor(() => expect(result.current.panels).toEqual([panel]));
    expect(refreshExtensionPanelCatalogIfFailed()).toBeNull();
    expect(getPanels).toHaveBeenCalledTimes(1);
  });
});
