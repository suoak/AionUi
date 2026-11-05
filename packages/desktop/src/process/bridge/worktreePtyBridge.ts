/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  createWorktreePtySession,
  getWorktreePtySession,
  killWorktreePty,
  listWorktreePtySessions,
  onWorktreePtyData,
  onWorktreePtyExit,
  readWorktreePtyForAgent,
  resizeWorktreePty,
  setWorktreePtyAgentAttached,
  writeWorktreePty,
} from '@process/services/worktreePty/worktreePtyManager';

export function initWorktreePtyBridge(): void {
  ipcBridge.worktreePty.list.provider(async () => listWorktreePtySessions());
  ipcBridge.worktreePty.get.provider(async ({ id }) => getWorktreePtySession(id));
  ipcBridge.worktreePty.create.provider(async (params) => createWorktreePtySession(params));
  ipcBridge.worktreePty.write.provider(async ({ id, data }) => {
    writeWorktreePty(id, data);
  });
  ipcBridge.worktreePty.resize.provider(async ({ id, cols, rows }) => {
    resizeWorktreePty(id, cols, rows);
  });
  ipcBridge.worktreePty.kill.provider(async ({ id }) => {
    killWorktreePty(id);
  });
  ipcBridge.worktreePty.setAgentAttached.provider(async ({ id, attached }) =>
    setWorktreePtyAgentAttached(id, attached)
  );
  ipcBridge.worktreePty.readForAgent.provider(async ({ id }) => readWorktreePtyForAgent(id));

  onWorktreePtyData((event) => {
    ipcBridge.worktreePty.onData.emit(event);
  });
  onWorktreePtyExit((event) => {
    ipcBridge.worktreePty.onExit.emit(event);
  });
}
