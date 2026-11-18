/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  assertRemotePortDistinct,
  isUsableLoopbackPort,
  probeRemoteHostHealth,
  remoteHostUrls,
  shouldAttachLocalApiSecret,
} from '@/common/ssh/remoteHostConnection';

describe('remoteHostConnection', () => {
  it('builds loopback http/ws/health URLs', () => {
    expect(remoteHostUrls(25808)).toEqual({
      baseUrl: 'http://127.0.0.1:25808',
      wsUrl: 'ws://127.0.0.1:25808/ws',
      healthUrl: 'http://127.0.0.1:25808/health',
    });
  });

  it('rejects unusable ports', () => {
    expect(isUsableLoopbackPort(25808)).toBe(true);
    expect(isUsableLoopbackPort(0)).toBe(false);
    expect(isUsableLoopbackPort(1.5)).toBe(false);
    expect(() => remoteHostUrls(0)).toThrow(/1–65535/);
    expect(() => assertRemotePortDistinct(0, 13400)).toThrow(/1–65535/);
  });

  it('refuses to use the locally spawned Host port as a remote target', () => {
    expect(() => assertRemotePortDistinct(13400, 13400)).toThrow(/local CSBU WorkMate Host/);
    expect(() => assertRemotePortDistinct(25808, 13400)).not.toThrow();
    expect(() => assertRemotePortDistinct(25808, 0)).not.toThrow();
  });

  it('attaches the local API secret only when the request port is the child', () => {
    expect(shouldAttachLocalApiSecret({ localBackendPort: 13400, requestPort: 13400 })).toBe(true);
    expect(shouldAttachLocalApiSecret({ localBackendPort: 13400, requestPort: 25808 })).toBe(false);
    expect(shouldAttachLocalApiSecret({ localBackendPort: 0, requestPort: 0 })).toBe(false);
  });

  it('accepts a 2xx health response on loopback', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch;
    await expect(probeRemoteHostHealth('http://127.0.0.1:25808/health', { fetchImpl })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-loopback health URL and a non-2xx response', async () => {
    await expect(probeRemoteHostHealth('http://example.com/health')).rejects.toThrow(/loopback/);
    const fetchImpl = vi.fn(async () => new Response('no', { status: 503 })) as unknown as typeof fetch;
    await expect(probeRemoteHostHealth('http://127.0.0.1:25808/health', { fetchImpl })).rejects.toThrow(/HTTP 503/);
  });

  it('times out an aborted health check', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        init?.signal?.addEventListener('abort', () => reject(err));
      });
    }) as unknown as typeof fetch;
    await expect(probeRemoteHostHealth('http://127.0.0.1:25808/health', { fetchImpl, timeoutMs: 10 })).rejects.toThrow(
      /timed out/
    );
  });
});
