/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { default as WorktreeTerminalPanel } from './WorktreeTerminalPanel';
export {
  WORKTREE_TERMINAL_DEFAULT_OPEN,
  WORKTREE_TERMINAL_DEFAULT_AGENT_ATTACHED,
  assertAgentMayReadTerminal,
  nextAgentAttachState,
  nextTerminalOpenState,
  resolveWorktreeTerminalAvailability,
  type WorktreeTerminalAvailability,
} from './worktreeTerminalState';
