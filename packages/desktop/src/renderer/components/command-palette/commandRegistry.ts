/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { PRIMARY_NAV_ENTRIES } from '@renderer/components/layout/primaryNav/primaryNav';

export type CommandGroup = 'navigation' | 'sessions' | 'workItems' | 'files' | 'agents' | 'commands' | 'settings';

/** Render + keyboard order of palette groups. */
export const PALETTE_GROUP_ORDER: readonly CommandGroup[] = [
  'navigation',
  'sessions',
  'workItems',
  'files',
  'agents',
  'commands',
  'settings',
] as const;

export type PaletteFileRef = {
  name: string;
  relativePath: string;
  fullPath: string;
};

export type PalettePluginCommandRef = {
  id: string;
  extensionName: string;
};

export type PaletteCommandAction = 'open-file' | 'invoke-command';

export type PaletteCommand = {
  id: string;
  title: string;
  /** i18n key for the title; `title` stays the English fallback and stays searchable. */
  titleKey?: string;
  group: CommandGroup;
  /** react-router path; optional when `action` is provided. */
  path?: string;
  /** In-app action for dynamic rows (preview a file, invoke a plugin command). Never shell. */
  action?: PaletteCommandAction;
  file?: PaletteFileRef;
  pluginCommand?: PalettePluginCommandRef;
  keywords?: string[];
  /** i18n key for the secondary line (e.g. board column, "Scheduled"); falls back to subtitle / path. */
  subtitleKey?: string;
  /** Literal secondary line (relative path, extension name). */
  subtitle?: string;
  /** Recency hint (ms epoch) used to order dynamic entries; higher = newer. */
  recency?: number;
};

/** Static navigation commands for Cmd/Ctrl+K (files and plugin commands load dynamically; no shell). */
const PRIMARY_NAV_TITLES: Record<(typeof PRIMARY_NAV_ENTRIES)[number]['key'], string> = {
  sessions: 'Sessions',
  tasks: 'Tasks',
  agents: 'Agents',
  skills: 'Skills',
  automations: 'Automations',
};

const PRIMARY_NAV_PALETTE_COMMANDS: readonly PaletteCommand[] = PRIMARY_NAV_ENTRIES.map((entry) => ({
  id: `nav.primary.${entry.key}`,
  title: PRIMARY_NAV_TITLES[entry.key],
  titleKey: `common.primaryNav.${entry.key}`,
  group: 'navigation' as const,
  path: entry.path,
  keywords: [...entry.keywords, 'primary', entry.key],
}));

export const STATIC_PALETTE_COMMANDS: readonly PaletteCommand[] = [
  {
    id: 'nav.new-chat',
    title: 'New chat',
    titleKey: 'common.commandPalette.commands.newChat',
    group: 'navigation',
    path: '/guid',
    keywords: ['home', 'compose', 'guid'],
  },
  ...PRIMARY_NAV_PALETTE_COMMANDS,
  {
    id: 'nav.automations.scheduled',
    title: 'Scheduled tasks',
    titleKey: 'common.commandPalette.commands.scheduledTasks',
    group: 'navigation',
    path: '/scheduled',
    keywords: ['automations', 'cron', 'schedule', '定时'],
  },
  {
    id: 'nav.automations.batch',
    title: 'Batch jobs',
    titleKey: 'common.commandPalette.commands.batchJobs',
    group: 'navigation',
    path: '/batch',
    keywords: ['automations', 'bulk', 'batch', '批量'],
  },
  {
    id: 'nav.agent-center.new',
    title: 'Create agent',
    titleKey: 'common.commandPalette.commands.createAgent',
    group: 'agents',
    path: '/agents/new',
    keywords: ['new agent', 'wizard'],
  },
  {
    id: 'nav.settings',
    title: 'Settings',
    titleKey: 'common.commandPalette.commands.settings',
    group: 'settings',
    path: '/settings',
    keywords: ['preferences', 'config'],
  },
  {
    id: 'nav.settings.governance',
    title: 'Governance',
    titleKey: 'common.commandPalette.commands.governance',
    group: 'settings',
    path: '/settings/governance',
    keywords: ['rbac', 'roles', 'permissions'],
  },
  {
    id: 'nav.settings.localKb',
    title: 'Local knowledge base',
    titleKey: 'common.commandPalette.commands.localKb',
    group: 'settings',
    path: '/settings/local-kb',
    keywords: ['local-kb', 'knowledge', 'kb', 'documents'],
  },
  {
    id: 'nav.settings.notifications',
    title: 'Notifications',
    titleKey: 'common.commandPalette.commands.notifications',
    group: 'settings',
    path: '/settings/notifications',
    keywords: ['notification', 'alert', 'cron'],
  },
  {
    id: 'nav.settings.shortcuts',
    title: 'Keyboard shortcuts',
    titleKey: 'common.commandPalette.commands.shortcuts',
    group: 'settings',
    path: '/settings/shortcuts',
    keywords: ['keyboard', 'shortcut', 'hotkey', 'keys'],
  },
  {
    id: 'nav.settings.remoteHost',
    title: 'Remote Host (SSH)',
    titleKey: 'common.commandPalette.commands.remoteHost',
    group: 'settings',
    path: '/settings/remote-host',
    keywords: ['remote', 'host', 'ssh', 'tunnel', 'headless'],
  },
  {
    id: 'nav.settings.extensions',
    title: 'Installed extensions',
    titleKey: 'common.commandPalette.commands.extensions',
    group: 'settings',
    path: '/settings/extensions',
    keywords: ['extension', 'plugin', 'addon', 'permissions'],
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
    const hay = [
      cmd.title,
      cmd.id,
      cmd.subtitle,
      cmd.file?.relativePath,
      cmd.file?.name,
      cmd.pluginCommand?.extensionName,
      ...(cmd.keywords ?? []),
    ]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export function groupPaletteCommands(commands: readonly PaletteCommand[]): Record<CommandGroup, PaletteCommand[]> {
  const out: Record<CommandGroup, PaletteCommand[]> = {
    navigation: [],
    sessions: [],
    workItems: [],
    files: [],
    agents: [],
    commands: [],
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
export const DYNAMIC_GROUPS: ReadonlySet<CommandGroup> = new Set([
  'sessions',
  'workItems',
  'files',
  'agents',
  'commands',
]);

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
