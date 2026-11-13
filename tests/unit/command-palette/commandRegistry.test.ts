import { describe, expect, it } from 'vitest';
import {
  DYNAMIC_GROUP_LIMIT_IDLE,
  DYNAMIC_GROUP_LIMIT_QUERY,
  PALETTE_GROUP_ORDER,
  STATIC_PALETTE_COMMANDS,
  buildPaletteSections,
  filterPaletteCommands,
  groupPaletteCommands,
  rankPaletteCommands,
  type PaletteCommand,
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

const dyn = (id: string, group: PaletteCommand['group'], title: string): PaletteCommand => ({
  id,
  group,
  title,
  path: `/${id}`,
});

describe('dynamic groups, ranking and sections (E11 PR2)', () => {
  it('groups expose the five palette groups in order', () => {
    expect(PALETTE_GROUP_ORDER).toEqual(['navigation', 'sessions', 'workItems', 'agents', 'settings']);
    const g = groupPaletteCommands([dyn('s', 'sessions', 'S'), dyn('w', 'workItems', 'W')]);
    expect(g.sessions.map((c) => c.id)).toEqual(['s']);
    expect(g.workItems.map((c) => c.id)).toEqual(['w']);
  });

  it('ranks title prefix > title substring > keyword match, stable otherwise', () => {
    const cmds = [
      { ...dyn('k', 'sessions', 'Zeta'), keywords: ['report'] },
      dyn('sub', 'sessions', 'Monthly report'),
      dyn('pre', 'sessions', 'Report draft'),
      dyn('pre2', 'sessions', 'report v2'),
    ];
    expect(rankPaletteCommands(cmds, 'report').map((c) => c.id)).toEqual(['pre', 'pre2', 'sub', 'k']);
    expect(rankPaletteCommands(cmds, '').map((c) => c.id)).toEqual(['k', 'sub', 'pre', 'pre2']);
  });

  it('builds ordered non-empty sections and caps only dynamic groups', () => {
    const sessions = Array.from({ length: 12 }, (_, i) => dyn(`s${i}`, 'sessions', `Chat ${i}`));
    const sections = buildPaletteSections([...STATIC_PALETTE_COMMANDS, ...sessions], '');
    expect(sections.map((s) => s.group)).toEqual(['navigation', 'sessions', 'agents', 'settings']);
    expect(sections.find((s) => s.group === 'sessions')?.commands).toHaveLength(DYNAMIC_GROUP_LIMIT_IDLE);
    expect(sections.find((s) => s.group === 'navigation')?.commands.length).toBe(
      STATIC_PALETTE_COMMANDS.filter((c) => c.group === 'navigation').length
    );

    const queried = buildPaletteSections(sessions, 'chat');
    expect(queried).toHaveLength(1);
    expect(queried[0].commands).toHaveLength(DYNAMIC_GROUP_LIMIT_QUERY);
    expect(buildPaletteSections(sessions, 'chat 11')[0].commands.map((c) => c.id)).toEqual(['s11']);
    expect(buildPaletteSections(sessions, 'zzz')).toEqual([]);
  });
});
