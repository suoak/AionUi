/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TFunction } from 'i18next';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { IWebUIStatus } from '@/common/adapter/ipcBridge';
import type { DevicePairingStatus, IDevice } from '@/common/types/device';
import { WEBUI_DEFAULT_PORT } from '@/common/config/constants';

/** Core `MAX_DEVICES_PER_USER` (aionui-auth device routes). */
export const MAX_DEVICES = 5;
/** Core `DEVICE_INACTIVITY_TTL_MS`: a device unused this long is revoked on its next call. */
export const DEVICE_INACTIVITY_TTL_DAYS = 90;
/** Start hinting at idleness well before the TTL. */
export const DEVICE_IDLE_HINT_DAYS = 30;
/** Core rename limit (1–64 printable characters). */
export const DEVICE_NAME_MAX = 64;

const DAY_MS = 24 * 60 * 60 * 1000;

export type DeviceIdleLevel = 'active' | 'idle' | 'expiring' | 'expired';

/** Core measures inactivity from `last_seen_at`, falling back to `created_at`. */
export function deviceLastActiveAt(device: Pick<IDevice, 'last_seen_at' | 'created_at'>): number {
  return device.last_seen_at ?? device.created_at;
}

export function deviceIdleDays(device: Pick<IDevice, 'last_seen_at' | 'created_at'>, now: number): number {
  return Math.max(0, Math.floor((now - deviceLastActiveAt(device)) / DAY_MS));
}

export function deviceIdleLevel(device: Pick<IDevice, 'last_seen_at' | 'created_at'>, now: number): DeviceIdleLevel {
  const days = deviceIdleDays(device, now);
  if (days >= DEVICE_INACTIVITY_TTL_DAYS) return 'expired';
  if (days >= DEVICE_INACTIVITY_TTL_DAYS - 10) return 'expiring';
  if (days >= DEVICE_IDLE_HINT_DAYS) return 'idle';
  return 'active';
}

export function isAtDeviceLimit(devices: readonly IDevice[] | undefined): boolean {
  return (devices?.length ?? 0) >= MAX_DEVICES;
}

/** Client-side mirror of Core's rename validation; `undefined` means valid. */
export function validateDeviceName(raw: string): 'empty' | 'tooLong' | 'invalid' | undefined {
  const name = raw.trim();
  if (!name) return 'empty';
  if ([...name].length > DEVICE_NAME_MAX) return 'tooLong';
  // Core rejects control characters.
  // oxlint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f]/.test(name)) return 'invalid';
  return undefined;
}

/**
 * The scannable QR payload: the server the phone should talk to plus the
 * one-time pairing token. The 6-digit code is never encoded; the user types it
 * on the phone. Remote-enabled WebUI exposes `networkUrl`; otherwise the phone
 * can only reach the desktop when it can resolve the local URL.
 */
export function buildPairingQrValue(status: IWebUIStatus | null | undefined, qrToken: string): string {
  const base =
    status?.allowRemote && status.networkUrl
      ? status.networkUrl
      : (status?.localUrl ?? `http://localhost:${status?.port ?? WEBUI_DEFAULT_PORT}`);
  return `${base.replace(/\/+$/, '')}/pair-device?token=${encodeURIComponent(qrToken)}`;
}

/** Whether a phone on another network/device can reach the URL in the QR. */
export function isPairingReachable(status: IWebUIStatus | null | undefined): boolean {
  return Boolean(status?.running && status.allowRemote && status.networkUrl);
}

/** Pairing states after which the offer can no longer be used. */
export function isPairingClosed(status: DevicePairingStatus | string | undefined): boolean {
  return status === 'paired' || status === 'rejected' || status === 'voided' || status === 'expired';
}

/**
 * Localised message for Core's device-management errors. Falls back to a
 * generic per-action message so raw English never reaches the user.
 */
export function getDeviceErrorMessage(
  error: unknown,
  t: TFunction,
  action: 'load' | 'pair' | 'rename' | 'revoke' | 'push' | 'reject'
): string {
  const fallback = t(`settings.devices.error.${action}`);
  if (!isBackendHttpError(error)) return fallback;
  const message = error.backendMessage || '';
  if (error.code === 'DEVICE_LIMIT_REACHED') return t('settings.devices.error.limit', { max: MAX_DEVICES });
  if (error.code === 'DEVICE_MANAGEMENT_REQUIRES_USER') return t('settings.devices.error.requiresUser');
  if (error.code === 'DEVICE_PAIRING_CLOSED') return t('settings.devices.error.pairingClosed');
  if (error.status === 404) {
    if (action === 'reject' || /pairing offer/i.test(message)) return t('settings.devices.error.pairingClosed');
    return t('settings.devices.error.notFound');
  }
  if (error.status === 400) {
    if (action === 'rename') return t('settings.devices.error.invalidName', { max: DEVICE_NAME_MAX });
    if (/IM push is not available/i.test(message)) return t('settings.devices.error.pushUnavailable');
    if (/push_target is required/i.test(message)) return t('settings.devices.error.pushTargetRequired');
    if (/invalid push_target/i.test(message)) return t('settings.devices.error.pushTargetInvalid');
    if (/push_kind/i.test(message)) return t('settings.devices.error.pushKindInvalid');
  }
  if (error.status === 401) return t('settings.devices.error.unauthorized');
  return fallback;
}
