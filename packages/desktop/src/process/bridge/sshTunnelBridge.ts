/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { getSshTunnelStatus, startSshTunnel, stopSshTunnel } from '@process/services/sshTunnelManager';

export function initSshTunnelBridge(): void {
  ipcBridge.sshTunnel.getStatus.provider(async () => getSshTunnelStatus());
  ipcBridge.sshTunnel.start.provider(async (params) => startSshTunnel(params));
  ipcBridge.sshTunnel.stop.provider(async () => stopSshTunnel());
}
