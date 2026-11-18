/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectRemoteBackend,
  disconnectRemoteBackend,
  disconnectRemoteBackendIfPort,
  getRemoteBackendStatus,
  getRendererBackendPort,
  initRemoteBackendManager,
  resetRemoteBackendManagerForTests,
} from '@process/services/remoteBackendManager';

describe('remoteBackendManager', () => {
  const reloadAppWindows = vi.fn();
  const probe = vi.fn(async () => undefined);

  beforeEach(() => {
    resetRemoteBackendManagerForTests();
    reloadAppWindows.mockReset();
    probe.mockReset();
    probe.mockResolvedValue(undefined);
    initRemoteBackendManager({
      getLocalBackendPort: () => 13400,
      reloadAppWindows,
      probe,
      reloadDelayMs: 0,
    });
  });

  afterEach(() => {
    resetRemoteBackendManagerForTests();
  });

  it('defaults the renderer to the locally spawned Host', () => {
    expect(getRemoteBackendStatus()).toEqual({
      mode: 'local',
      port: 13400,
      baseUrl: 'http://127.0.0.1:13400',
    });
    expect(getRendererBackendPort()).toBe(13400);
    expect(reloadAppWindows).not.toHaveBeenCalled();
  });

  it('switches the renderer port after a successful health check and reloads', async () => {
    const status = await connectRemoteBackend(25808);
    expect(status).toEqual({
      mode: 'remote',
      port: 25808,
      baseUrl: 'http://127.0.0.1:25808',
    });
    expect(probe).toHaveBeenCalledWith('http://127.0.0.1:25808/health', undefined);
    expect(getRendererBackendPort()).toBe(25808);
    await vi.waitFor(() => expect(reloadAppWindows).toHaveBeenCalledTimes(1));
  });

  it('does not switch or reload when the health check fails', async () => {
    probe.mockRejectedValueOnce(new Error('Remote Host did not respond to health check (HTTP 503)'));
    await expect(connectRemoteBackend(25808)).rejects.toThrow(/HTTP 503/);
    expect(getRendererBackendPort()).toBe(13400);
    expect(getRemoteBackendStatus().mode).toBe('local');
    await new Promise((r) => setTimeout(r, 20));
    expect(reloadAppWindows).not.toHaveBeenCalled();
  });

  it('refuses to connect to the local Host port without probing', async () => {
    await expect(connectRemoteBackend(13400)).rejects.toThrow(/local CSBU WorkMate Host/);
    expect(probe).not.toHaveBeenCalled();
    expect(getRendererBackendPort()).toBe(13400);
  });

  it('disconnects back to the local Host and reloads', async () => {
    await connectRemoteBackend(25808);
    await vi.waitFor(() => expect(reloadAppWindows).toHaveBeenCalledTimes(1));
    const status = await disconnectRemoteBackend();
    expect(status.mode).toBe('local');
    expect(status.port).toBe(13400);
    expect(getRendererBackendPort()).toBe(13400);
    await vi.waitFor(() => expect(reloadAppWindows).toHaveBeenCalledTimes(2));
  });

  it('disconnects only when the dropped tunnel port is the active remote', async () => {
    await connectRemoteBackend(25808);
    await vi.waitFor(() => expect(reloadAppWindows).toHaveBeenCalledTimes(1));
    expect(await disconnectRemoteBackendIfPort(22)).toBe(false);
    expect(getRemoteBackendStatus().mode).toBe('remote');
    expect(await disconnectRemoteBackendIfPort(25808)).toBe(true);
    expect(getRemoteBackendStatus().mode).toBe('local');
    await vi.waitFor(() => expect(reloadAppWindows).toHaveBeenCalledTimes(2));
  });

  it('does not reload again when already connected to the same port', async () => {
    await connectRemoteBackend(25808);
    await vi.waitFor(() => expect(reloadAppWindows).toHaveBeenCalledTimes(1));
    await connectRemoteBackend(25808);
    await new Promise((r) => setTimeout(r, 20));
    expect(reloadAppWindows).toHaveBeenCalledTimes(1);
  });
});
