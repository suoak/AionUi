/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { worktreePty } from '@/common/adapter/ipcBridge';
import { collectAttachedTerminalContext } from '@/common/worktreeTerminal/attachedTerminalContext';
import { isWindows } from '@/renderer/utils/platform';

/**
 * If the user attached the worktree terminal for this conversation's
 * workspace, append a recent snapshot so the agent can read it. Fail-soft.
 */
export async function withAttachedTerminalContext(input: string, workspacePath: string | undefined): Promise<string> {
  return collectAttachedTerminalContext(input, workspacePath, {
    list: () => worktreePty.list.invoke(),
    readForAgent: async (id) => (await worktreePty.readForAgent.invoke({ id })).data,
    caseInsensitiveCwd: isWindows(),
  });
}
