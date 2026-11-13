/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { PRIMARY_NAV_ENTRIES } from '@renderer/components/layout/primaryNav/primaryNav';

export type CommandGroup = 'navigation' | 'sessions' | 'workItems' | 'agents' | 'settings';

/** Render + keyboard order of palette groups. */
export const PALETTE_GROUP_ORDER: readonly CommandGroup[] = [
  'navigation',
  'sessions',
  'workItems',
  'agents',
  'settings',
] as const;

export type PaletteCommand = {
  id: string;
  title: string;
  group: CommandGroup;
  /** react-router path; optional when `run` is provided by the host. */
  path?: string;
  keywords?: string[];
  /** i18n key for the secondary line (e.g. board column, "Scheduled"); falls back to the path. */
  subtitleKey?: string;
  /** Recency hint (ms epoch) used to order dynamic entries; higher = newer. */
  recency?: number;
};

/** Static navigation commands for Cmd/Ctrl+K v1 (no shell, no plugin wiring). */
const PRIMARY_NAV_TITLES: Record<(typeof PRIMARY_NAV_ENTRIES)[number]['key'], string> = {
  sessions: 'Sessions',
  workItems: 'Work items',
  agents: 'Agents',
  skills: 'Skills',
  batch: 'Batch',
};

const PRIMARY_NAV_PALETTE_COMMANDS: readonly PaletteCommand[] = PRIMARY_NAV_ENTRIES.map((entry) => ({
  id: `nav.primary.${entry.key}`,
  title: PRIMARY_NAV_TITLES[entry.key],
  group: 'navigation' as const,
  path: entry.path,
  keywords: [...entry.keywords, 'primary', entry.key],
}));

export const STATIC_PALETTE_COMMANDS: readonly PaletteCommand[] = [
  {
    id: 'nav.new-chat',
    title: 'New chat',
    group: 'navigation',
    path: '/guid',
    keywords: ['home', 'compose', 'guid'],
  },
  ...PRIMARY_NAV_PALETTE_COMMANDS,
  {
    id: 'nav.agent-center',
    title: 'Agent Center',
    group: 'agents',
    path: '/agent-center',
    keywords: ['assistant', '智能体', 'agents'],
  },
  {
    id: 'nav.agent-center.new',
    title: 'Create agent',
    group: 'agents',
    path: '/agent-center/new',
    keywords: ['new agent', 'wizard'],
  },
  {
    id: 'nav.settings',
    title: 'Settings',
    group: 'settings',
    path: '/settings',
    keywords: ['preferences', 'config'],
  },
  {
    id: 'nav.settings.governance',
    title: 'Governance',
    group: 'settings',
    path: '/settings/governance',
    keywords: ['rbac', 'roles', 'permissions'],
  },
  {
    id: 'nav.settings.localKb',
    title: 'Local knowledge base',
    group: 'settings',
    path: '/settings/local-kb',
    keywords: ['local-kb', 'knowledge', 'kb', 'documents'],
  },
] as const;

export function normalizePaletteQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** Case-insensitive substring match on title + keywords. Empty query → all. */
export function filterPaletteCommands(commands: readonly PaletteCommand[], query: string): PaletteCommand[] {
  const q = normalizePaletteQuery(query);
  if (!q) return [...commands];
  return commands.filter((cmd) => {
    const hay = [cmd.title, cmd.id, ...(cmd.keywords ?? [])].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export function groupPaletteCommands(commands: readonly PaletteCommand[]): Record<CommandGroup, PaletteCommand[]> {
  const out: Record<CommandGroup, PaletteCommand[]> = {
    navigation: [],
    sessions: [],
    workItems: [],
    agents: [],
    settings: [],
  };
  for (const cmd of commands) {
    out[cmd.group].push(cmd);
  }
  return out;
}

/**
 * Rank filtered commands for display: title prefix matches first, then title
 * substring, then keyword/id matches; ties keep the incoming order (stable).
 */
export function rankPaletteCommands(commands: readonly PaletteCommand[], query: string): PaletteCommand[] {
  const q = normalizePaletteQuery(query);
  if (!q) return [...commands];
  const score = (cmd: PaletteCommand) => {
    const title = cmd.title.toLowerCase();
    if (title.startsWith(q)) return 0;
    if (title.includes(q)) return 1;
    return 2;
  };
  return commands
    .map((cmd, index) => ({ cmd, index, s: score(cmd) }))
    .toSorted((a, b) => a.s - b.s || a.index - b.index)
    .map((x) => x.cmd);
}

/** Max entries shown per dynamic group (empty query vs. typed query). */
export const DYNAMIC_GROUP_LIMIT_IDLE = 5;
export const DYNAMIC_GROUP_LIMIT_QUERY = 8;
const DYNAMIC_GROUPS: ReadonlySet<CommandGroup> = new Set(['sessions', 'workItems', 'agents']);

export type PaletteSection = { group: CommandGroup; commands: PaletteCommand[] };

/**
 * Filter + rank + cap commands into ordered, non-empty sections. The flattened
 * section order is the keyboard order. Static groups are never capped.
 */
export function buildPaletteSections(commands: readonly PaletteCommand[], query: string): PaletteSection[] {
  const hasQuery = normalizePaletteQuery(query).length > 0;
  const limit = hasQuery ? DYNAMIC_GROUP_LIMIT_QUERY : DYNAMIC_GROUP_LIMIT_IDLE;
  const grouped = groupPaletteCommands(rankPaletteCommands(filterPaletteCommands(commands, query), query));
  const sections: PaletteSection[] = [];
  for (const group of PALETTE_GROUP_ORDER) {
    const list = DYNAMIC_GROUPS.has(group) ? grouped[group].slice(0, limit) : grouped[group];
    if (list.length > 0) sections.push({ group, commands: list });
  }
  return sections;
}
