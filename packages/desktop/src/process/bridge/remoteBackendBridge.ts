/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  connectRemoteBackend,
  disconnectRemoteBackend,
  getRemoteBackendStatus,
} from '@process/services/remoteBackendManager';

export function initRemoteBackendBridge(): void {
  ipcBridge.remoteBackend.getStatus.provider(async () => getRemoteBackendStatus());
  ipcBridge.remoteBackend.connect.provider(async (params) => connectRemoteBackend(params.port));
  ipcBridge.remoteBackend.disconnect.provider(async () => disconnectRemoteBackend());
}
