import { describe, expect, it } from 'vitest';
import {
  WORKTREE_TERMINAL_DEFAULT_OPEN,
  nextTerminalOpenState,
  resolveWorktreeTerminalAvailability,
} from '@/renderer/components/worktree-terminal/worktreeTerminalState';

describe('worktreeTerminalState', () => {
  it('defaults closed', () => {
    expect(WORKTREE_TERMINAL_DEFAULT_OPEN).toBe(false);
  });

  it('toggles open state', () => {
    expect(nextTerminalOpenState(false)).toBe(true);
    expect(nextTerminalOpenState(true)).toBe(false);
  });

  it('marks webui as stub', () => {
    expect(resolveWorktreeTerminalAvailability(false)).toBe('webui-stub');
    expect(resolveWorktreeTerminalAvailability(true)).toBe('desktop');
  });
});
