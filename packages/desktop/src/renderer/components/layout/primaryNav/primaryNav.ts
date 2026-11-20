/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CSBU WorkMate 3.0 information architecture — five primary entries.
 *
 * `sessions` (new chat + history) · `tasks` · `agents` · `skills` · `automations`.
 * Legacy paths (`/work-items`, `/agent-center`, `/batch`, …) keep working through
 * redirects in `routeAliases.tsx` or stay as routes highlighted under their new entry.
 */

export type PrimaryNavKey = 'sessions' | 'tasks' | 'agents' | 'skills' | 'automations';

export type PrimaryNavEntry = {
  key: PrimaryNavKey;
  /** i18n key under `common.primaryNav.*` */
  labelKey: `common.primaryNav.${PrimaryNavKey}`;
  /** Canonical deep-link path. */
  path: string;
  /** Extra path prefixes treated as "active" for this entry. */
  activePrefixes: readonly string[];
  keywords: readonly string[];
};

/** Canonical order of the five primary entries. */
export const PRIMARY_NAV_ENTRIES: readonly PrimaryNavEntry[] = [
  {
    key: 'sessions',
    labelKey: 'common.primaryNav.sessions',
    path: '/sessions',
    activePrefixes: ['/sessions', '/guid', '/conversation'],
    keywords: ['chat', 'conversation', 'history', '会话'],
  },
  {
    key: 'tasks',
    labelKey: 'common.primaryNav.tasks',
    path: '/tasks',
    activePrefixes: ['/tasks', '/work-items'],
    keywords: ['board', 'work items', 'kanban', '任务', '工作项'],
  },
  {
    key: 'agents',
    labelKey: 'common.primaryNav.agents',
    path: '/agents',
    activePrefixes: ['/agents', '/agent-center'],
    keywords: ['assistant', 'agent center', '智能体', '助手'],
  },
  {
    key: 'skills',
    labelKey: 'common.primaryNav.skills',
    path: '/skills',
    activePrefixes: ['/skills', '/skill-evolution', '/settings/skills'],
    keywords: ['skill', 'evolution', '技能'],
  },
  {
    key: 'automations',
    labelKey: 'common.primaryNav.automations',
    path: '/automations',
    activePrefixes: ['/automations', '/scheduled', '/batch'],
    keywords: ['scheduled', 'cron', 'batch', 'bulk', '定时', '批量', '自动化'],
  },
] as const;

export function primaryNavEntryByKey(key: PrimaryNavKey): PrimaryNavEntry {
  const found = PRIMARY_NAV_ENTRIES.find((e) => e.key === key);
  if (!found) {
    throw new Error(`unknown primary nav key: ${key}`);
  }
  return found;
}

/** Whether `pathname` should highlight the given primary entry. */
export function isPrimaryNavActive(entry: PrimaryNavEntry, pathname: string): boolean {
  return entry.activePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
