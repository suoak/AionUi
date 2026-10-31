/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TaskApprovalStatus, TaskArtifactKind } from './agent/taskSession';

/**
 * Paired mobile devices (M8 E9). Shapes mirror aioncore
 * `aionui-auth/src/device/{routes,pairing}.rs` (DeviceView, PairingOffer,
 * PairingOfferView) and `aionui-conversation` `task.approval.changed`.
 */

export type DevicePlatform = 'ios' | 'android' | 'web';
export type DevicePushKind = 'none' | 'im';

/** `GET /api/auth/devices` item; revoked devices are never listed. */
export type IDevice = {
  id: string;
  name: string;
  platform: DevicePlatform | string;
  scopes: string[];
  push_kind: DevicePushKind | string;
  /** IM channel session id when `push_kind` is `im`. */
  push_target?: string | null;
  /** Epoch ms of the last authenticated call (throttled to ~60s by Core). */
  last_seen_at?: number | null;
  created_at: number;
};

/** `POST /api/auth/devices/pair/offers`. `code` is shown on the desktop only. */
export type IDevicePairingOffer = {
  offer_id: string;
  qr_token: string;
  code: string;
  expires_at: number;
};

export type DevicePairingStatus = 'waiting' | 'requested' | 'confirming' | 'paired' | 'rejected' | 'voided' | 'expired';

/** `GET /api/auth/devices/pair/offers/{id}` and the `device.pairing` WS payload. */
export type IDevicePairingView = {
  user_id?: string;
  offer_id: string;
  status: DevicePairingStatus | string;
  device_name?: string | null;
  platform?: string | null;
  device_id?: string | null;
  expires_at: number;
};

export type ISetDevicePushInput = {
  id: string;
  push_kind: DevicePushKind;
  push_target?: string;
};

/** Who answered a Plan/Goal approval (aioncore ≥ E9-3; absent on older cores). */
export type TaskApprovalDecidedVia = 'device' | 'user';

/** `task.approval.changed` WS payload. */
export type ITaskApprovalChangedEvent = {
  user_id?: string;
  task_session_id: string;
  approval_id: string;
  approval_type: TaskArtifactKind | string;
  status: TaskApprovalStatus | string;
  decided_via?: TaskApprovalDecidedVia | null;
  device_id?: string | null;
};
