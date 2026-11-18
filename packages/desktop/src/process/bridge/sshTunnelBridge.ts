/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { getSshTunnelStatus, startSshTunnel, stopSshTunnel } from '@process/services/sshTunnelManager';
import { disconnectRemoteBackendIfPort } from '@process/services/remoteBackendManager';

export function initSshTunnelBridge(): void {
  ipcBridge.sshTunnel.getStatus.provider(async () => getSshTunnelStatus());
  ipcBridge.sshTunnel.start.provider(async (params) => startSshTunnel(params));
  ipcBridge.sshTunnel.stop.provider(async () => {
    const previous = getSshTunnelStatus();
    const next = await stopSshTunnel();
    if (typeof previous.localPort === 'number') {
      await disconnectRemoteBackendIfPort(previous.localPort);
    }
    return next;
  });
}
