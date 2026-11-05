/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  WORKTREE_TERMINAL_DEFAULT_AGENT_ATTACHED,
  WORKTREE_TERMINAL_DEFAULT_OPEN,
  assertAgentMayReadTerminal,
  nextAgentAttachState,
  nextTerminalOpenState,
  resolveWorktreeTerminalAvailability,
} from '@/renderer/components/worktree-terminal/worktreeTerminalState';

describe('worktreeTerminalState', () => {
  it('defaults closed and agent detached', () => {
    expect(WORKTREE_TERMINAL_DEFAULT_OPEN).toBe(false);
    expect(WORKTREE_TERMINAL_DEFAULT_AGENT_ATTACHED).toBe(false);
  });

  it('toggles open state', () => {
    expect(nextTerminalOpenState(false)).toBe(true);
    expect(nextTerminalOpenState(true)).toBe(false);
  });

  it('marks webui as stub', () => {
    expect(resolveWorktreeTerminalAvailability(false)).toBe('webui-stub');
    expect(resolveWorktreeTerminalAvailability(true)).toBe('desktop');
  });

  it('blocks agent reads until attached', () => {
    expect(assertAgentMayReadTerminal(false)).toMatch(/cannot read/i);
    expect(assertAgentMayReadTerminal(true)).toBeNull();
    expect(nextAgentAttachState(false)).toBe(true);
  });
});
