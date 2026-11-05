/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type CommandGroup = 'navigation' | 'agents' | 'settings';

export type PaletteCommand = {
  id: string;
  title: string;
  group: CommandGroup;
  /** react-router path; optional when `run` is provided by the host. */
  path?: string;
  keywords?: string[];
};

/** Static navigation commands for Cmd/Ctrl+K v1 (no shell, no plugin wiring). */
export const STATIC_PALETTE_COMMANDS: readonly PaletteCommand[] = [
  {
    id: 'nav.new-chat',
    title: 'New chat',
    group: 'navigation',
    path: '/guid',
    keywords: ['home', 'compose', 'guid'],
  },
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
    agents: [],
    settings: [],
  };
  for (const cmd of commands) {
    out[cmd.group].push(cmd);
  }
  return out;
}
