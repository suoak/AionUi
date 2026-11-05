/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Agent must not read PTY output until the user explicitly attaches. */
export const WORKTREE_TERMINAL_DEFAULT_AGENT_ATTACHED = false;

export function nextAgentAttachState(attached: boolean): boolean {
  return !attached;
}

/**
 * Gate for agent-facing terminal reads. Returns an error message when blocked.
 */
export function assertAgentMayReadTerminal(agentAttached: boolean): string | null {
  if (!agentAttached) {
    return 'Agent cannot read this terminal until you attach it';
  }
  return null;
}
