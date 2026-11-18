/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * E14 desktop "connect to remote Host" helpers.
 *
 * The desktop may open an SSH loopback forward (or an equivalent manual
 * `ssh -L`) and then point the renderer at that port. The locally spawned
 * aioncore stays on its own port; the per-launch local API secret must never
 * be attached to the remote Host (D14-2: existing workspace auth).
 *
 * Brand: CSBU WorkMate. No AGPL.
 */

export type RemoteBackendMode = 'local' | 'remote';

export type RemoteBackendStatus = {
  mode: RemoteBackendMode;
  /** Port the desktop renderer should use. */
  port: number;
  baseUrl?: string;
};

export function isUsableLoopbackPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function remoteHostUrls(port: number): { baseUrl: string; wsUrl: string; healthUrl: string } {
  if (!isUsableLoopbackPort(port)) {
    throw new Error('Port must be an integer 1–65535');
  }
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    healthUrl: `${baseUrl}/health`,
  };
}

/**
 * Refuse pointing the renderer at the locally spawned Host. Those requests
 * would otherwise look like a "remote" connection while still being the child
 * aioncore (and might carry or drop the local API secret incorrectly).
 */
export function assertRemotePortDistinct(remotePort: number, localBackendPort: number): void {
  if (!isUsableLoopbackPort(remotePort)) {
    throw new Error('Remote Host port must be an integer 1–65535');
  }
  if (localBackendPort > 0 && remotePort === localBackendPort) {
    throw new Error('That port is the local CSBU WorkMate Host; use the SSH tunnel local port instead');
  }
}

/**
 * Attach the per-launch local API secret only when the request targets the
 * spawned child. Remote Host requests must use workspace auth (D14-2).
 */
export function shouldAttachLocalApiSecret(opts: { localBackendPort: number; requestPort: number }): boolean {
  return opts.localBackendPort > 0 && opts.requestPort === opts.localBackendPort;
}

const DEFAULT_HEALTH_TIMEOUT_MS = 3_000;

export type ProbeRemoteHostHealthOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Confirm a loopback Host is reachable before switching the renderer.
 * 2xx is enough; the body is not parsed or logged.
 */
export async function probeRemoteHostHealth(
  healthUrl: string,
  options: ProbeRemoteHostHealthOptions = {}
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(healthUrl);
  } catch {
    throw new Error('Remote Host health URL is invalid');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Remote Host health URL must be http(s)');
  }
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error('Remote Host connections are limited to loopback (127.0.0.1)');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(healthUrl, { method: 'GET', signal: ac.signal, redirect: 'manual' });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Remote Host did not respond to health check (HTTP ${res.status})`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Remote Host health check timed out. Is the SSH tunnel up?', { cause: error });
    }
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}
