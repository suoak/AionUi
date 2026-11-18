/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * E14: switch the desktop renderer between the locally spawned Host and a
 * loopback-forwarded remote Host (SSH tunnel or manual `ssh -L`).
 *
 * Main-process callers keep talking to the local child (migrations, WebUI
 * proxy, cron resume). Only `get-backend-port` (preload / renderer) changes.
 * The local API secret hook must keep using the child port.
 *
 * Brand: CSBU WorkMate.
 */

import {
  assertRemotePortDistinct,
  probeRemoteHostHealth,
  remoteHostUrls,
  type ProbeRemoteHostHealthOptions,
  type RemoteBackendStatus,
} from '@/common/ssh/remoteHostConnection';

export type RemoteBackendManagerDeps = {
  getLocalBackendPort: () => number;
  reloadAppWindows: () => void;
  probe?: typeof probeRemoteHostHealth;
  probeOptions?: ProbeRemoteHostHealthOptions;
  /** Delay before reload so the IPC reply can reach the renderer first. */
  reloadDelayMs?: number;
};

let deps: RemoteBackendManagerDeps | null = null;
let remotePort: number | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

export function initRemoteBackendManager(next: RemoteBackendManagerDeps): void {
  deps = next;
}

export function resetRemoteBackendManagerForTests(): void {
  if (reloadTimer) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
  }
  deps = null;
  remotePort = null;
}

function requireDeps(): RemoteBackendManagerDeps {
  if (!deps) {
    throw new Error('Remote Host connection manager is not initialized');
  }
  return deps;
}

function statusFrom(port: number | null, localPort: number): RemoteBackendStatus {
  if (port != null) {
    return { mode: 'remote', port, baseUrl: remoteHostUrls(port).baseUrl };
  }
  return {
    mode: 'local',
    port: localPort,
    baseUrl: localPort > 0 ? remoteHostUrls(localPort).baseUrl : undefined,
  };
}

export function getRemoteBackendStatus(): RemoteBackendStatus {
  const localPort = deps?.getLocalBackendPort() ?? 0;
  return statusFrom(remotePort, localPort);
}

/** Port exposed to the renderer via `get-backend-port`. */
export function getRendererBackendPort(): number {
  if (remotePort != null) return remotePort;
  return deps?.getLocalBackendPort() ?? 0;
}

function scheduleReload(reloadAppWindows: () => void, delayMs: number): void {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    reloadAppWindows();
  }, delayMs);
}

export async function connectRemoteBackend(port: number): Promise<RemoteBackendStatus> {
  const current = requireDeps();
  const localPort = current.getLocalBackendPort();
  assertRemotePortDistinct(port, localPort);
  const { healthUrl, baseUrl } = remoteHostUrls(port);
  const probe = current.probe ?? probeRemoteHostHealth;
  await probe(healthUrl, current.probeOptions);
  const alreadyConnected = remotePort === port;
  remotePort = port;
  if (!alreadyConnected) {
    scheduleReload(current.reloadAppWindows, current.reloadDelayMs ?? 0);
  }
  return { mode: 'remote', port, baseUrl };
}

export async function disconnectRemoteBackend(): Promise<RemoteBackendStatus> {
  const current = requireDeps();
  const wasRemote = remotePort != null;
  remotePort = null;
  if (wasRemote) {
    scheduleReload(current.reloadAppWindows, current.reloadDelayMs ?? 0);
  }
  return statusFrom(null, current.getLocalBackendPort());
}

/** If the desktop is connected through this loopback port, drop back to local. */
export async function disconnectRemoteBackendIfPort(port: number): Promise<boolean> {
  if (remotePort !== port) return false;
  await disconnectRemoteBackend();
  return true;
}
