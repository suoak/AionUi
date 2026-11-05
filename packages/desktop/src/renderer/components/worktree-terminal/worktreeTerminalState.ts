/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Pure helpers for the E11 worktree terminal shell (no PTY yet). */

export type WorktreeTerminalAvailability = 'desktop' | 'webui-stub';

export function resolveWorktreeTerminalAvailability(isDesktop: boolean): WorktreeTerminalAvailability {
  return isDesktop ? 'desktop' : 'webui-stub';
}

export function nextTerminalOpenState(currentlyOpen: boolean): boolean {
  return !currentlyOpen;
}

/** Default: closed (D11-t1). */
export const WORKTREE_TERMINAL_DEFAULT_OPEN = false;
