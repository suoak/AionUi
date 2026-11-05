/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Pure helpers for the E11 worktree terminal (PTY + agent attach gate). */

export type WorktreeTerminalAvailability = 'desktop' | 'webui-stub';

/** D11-t1: collapsed until the user opens the panel. */
export const WORKTREE_TERMINAL_DEFAULT_OPEN = false;

export {
  WORKTREE_TERMINAL_DEFAULT_AGENT_ATTACHED,
  assertAgentMayReadTerminal,
  nextAgentAttachState,
} from '@/common/worktreeTerminal/agentAttachGate';

export function resolveWorktreeTerminalAvailability(isDesktop: boolean): WorktreeTerminalAvailability {
  return isDesktop ? 'desktop' : 'webui-stub';
}

export function nextTerminalOpenState(open: boolean): boolean {
  return !open;
}
