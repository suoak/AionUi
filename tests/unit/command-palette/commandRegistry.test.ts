import { describe, expect, it } from 'vitest';
import {
  STATIC_PALETTE_COMMANDS,
  filterPaletteCommands,
  groupPaletteCommands,
} from '@/renderer/components/command-palette/commandRegistry';

describe('filterPaletteCommands', () => {
  it('returns all commands for empty query', () => {
    expect(filterPaletteCommands(STATIC_PALETTE_COMMANDS, '  ')).toHaveLength(STATIC_PALETTE_COMMANDS.length);
  });

  it('matches title substring', () => {
    const hits = filterPaletteCommands(STATIC_PALETTE_COMMANDS, 'agent');
    expect(hits.some((c) => c.id === 'nav.agent-center')).toBe(true);
  });

  it('matches keywords', () => {
    const hits = filterPaletteCommands(STATIC_PALETTE_COMMANDS, 'rbac');
    expect(hits.map((c) => c.id)).toContain('nav.settings.governance');
  });

  it('returns empty when nothing matches', () => {
    expect(filterPaletteCommands(STATIC_PALETTE_COMMANDS, 'zzz-no-such')).toEqual([]);
  });
});

describe('groupPaletteCommands', () => {
  it('buckets by group', () => {
    const g = groupPaletteCommands(STATIC_PALETTE_COMMANDS);
    expect(g.navigation.length).toBeGreaterThan(0);
    expect(g.agents.length).toBeGreaterThan(0);
    expect(g.settings.length).toBeGreaterThan(0);
  });
});
