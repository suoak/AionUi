/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import {
  MAX_DEVICES,
  buildPairingQrValue,
  deviceIdleDays,
  deviceIdleLevel,
  getDeviceErrorMessage,
  isAtDeviceLimit,
  isPairingClosed,
  isPairingReachable,
  validateDeviceName,
} from '@/renderer/pages/settings/DevicesSettings/devicesModel';
import type { IDevice } from '@/common/types/device';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

const device = (over: Partial<IDevice> = {}): IDevice => ({
  id: 'dev_1',
  name: 'Lian iPhone',
  platform: 'ios',
  scopes: ['approvals'],
  push_kind: 'none',
  push_target: null,
  last_seen_at: NOW,
  created_at: NOW - 100 * DAY,
  ...over,
});

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key) as unknown as Parameters<typeof getDeviceErrorMessage>[1];

const httpError = (status: number, message: string, code?: string) =>
  new BackendHttpError({
    method: 'GET',
    path: '/api/auth/devices',
    status,
    body: { success: false, error: message, code },
  });

describe('devicesModel idle hints', () => {
  it('uses last_seen_at, falling back to created_at', () => {
    expect(deviceIdleDays(device({ last_seen_at: NOW - 3 * DAY }), NOW)).toBe(3);
    expect(deviceIdleDays(device({ last_seen_at: null, created_at: NOW - 12 * DAY }), NOW)).toBe(12);
  });

  it('grades idleness against the 90-day inactivity TTL', () => {
    expect(deviceIdleLevel(device({ last_seen_at: NOW - 29 * DAY }), NOW)).toBe('active');
    expect(deviceIdleLevel(device({ last_seen_at: NOW - 30 * DAY }), NOW)).toBe('idle');
    expect(deviceIdleLevel(device({ last_seen_at: NOW - 80 * DAY }), NOW)).toBe('expiring');
    expect(deviceIdleLevel(device({ last_seen_at: NOW - 90 * DAY }), NOW)).toBe('expired');
  });

  it('caps at five devices', () => {
    expect(MAX_DEVICES).toBe(5);
    expect(isAtDeviceLimit(Array.from({ length: 4 }, () => device()))).toBe(false);
    expect(isAtDeviceLimit(Array.from({ length: 5 }, () => device()))).toBe(true);
    expect(isAtDeviceLimit(undefined)).toBe(false);
  });
});

describe('validateDeviceName', () => {
  it('mirrors Core: trimmed, 1-64 chars, no control characters', () => {
    expect(validateDeviceName('  ')).toBe('empty');
    expect(validateDeviceName('a'.repeat(65))).toBe('tooLong');
    expect(validateDeviceName('😀'.repeat(64))).toBeUndefined();
    expect(validateDeviceName('bad\nname')).toBe('invalid');
    expect(validateDeviceName('bad\u0085name')).toBe('invalid');
    expect(validateDeviceName('  Work phone ')).toBeUndefined();
  });
});

describe('pairing helpers', () => {
  it('encodes only the server URL and the one-time token, never the code', () => {
    expect(
      buildPairingQrValue(
        {
          running: true,
          port: 25808,
          allowRemote: true,
          localUrl: 'http://localhost:25808',
          networkUrl: 'http://10.0.0.5:25808/',
        },
        'tok en'
      )
    ).toBe('http://10.0.0.5:25808/pair-device?token=tok%20en');
    expect(
      buildPairingQrValue({ running: true, port: 25808, allowRemote: false, localUrl: 'http://localhost:25808' }, 't')
    ).toBe('http://localhost:25808/pair-device?token=t');
    expect(buildPairingQrValue(null, 't')).toMatch(/^http:\/\/localhost:\d+\/pair-device\?token=t$/);
  });

  it('is reachable only with remote WebUI and a network URL', () => {
    expect(isPairingReachable(null)).toBe(false);
    expect(isPairingReachable({ running: true, port: 1, allowRemote: false, localUrl: 'x' })).toBe(false);
    expect(isPairingReachable({ running: true, port: 1, allowRemote: true, localUrl: 'x', networkUrl: 'y' })).toBe(
      true
    );
  });

  it('treats paired/rejected/voided/expired as closed', () => {
    for (const s of ['paired', 'rejected', 'voided', 'expired']) expect(isPairingClosed(s)).toBe(true);
    for (const s of ['waiting', 'requested', 'confirming', undefined]) expect(isPairingClosed(s)).toBe(false);
  });
});

describe('getDeviceErrorMessage', () => {
  it('maps Core codes and messages to localized keys', () => {
    expect(getDeviceErrorMessage(httpError(409, 'limit', 'DEVICE_LIMIT_REACHED'), t, 'pair')).toBe(
      'settings.devices.error.limit:{"max":5}'
    );
    expect(getDeviceErrorMessage(httpError(409, 'closed', 'DEVICE_PAIRING_CLOSED'), t, 'reject')).toBe(
      'settings.devices.error.pairingClosed'
    );
    expect(getDeviceErrorMessage(httpError(403, 'x', 'DEVICE_MANAGEMENT_REQUIRES_USER'), t, 'load')).toBe(
      'settings.devices.error.requiresUser'
    );
    expect(getDeviceErrorMessage(httpError(404, 'Device not found'), t, 'revoke')).toBe(
      'settings.devices.error.notFound'
    );
    expect(getDeviceErrorMessage(httpError(404, 'Pairing offer not found'), t, 'pair')).toBe(
      'settings.devices.error.pairingClosed'
    );
    expect(getDeviceErrorMessage(httpError(400, 'device_name must be 1-64 printable characters'), t, 'rename')).toBe(
      'settings.devices.error.invalidName:{"max":64}'
    );
    expect(getDeviceErrorMessage(httpError(400, 'invalid push_target'), t, 'push')).toBe(
      'settings.devices.error.pushTargetInvalid'
    );
    expect(getDeviceErrorMessage(httpError(401, 'nope'), t, 'load')).toBe('settings.devices.error.unauthorized');
  });

  it('never leaks raw errors', () => {
    expect(getDeviceErrorMessage(new Error('socket hang up'), t, 'push')).toBe('settings.devices.error.push');
    expect(getDeviceErrorMessage(httpError(500, 'internal'), t, 'rename')).toBe('settings.devices.error.rename');
  });
});
