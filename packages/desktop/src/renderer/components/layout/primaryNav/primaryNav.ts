/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M9 E16 / S11 IA — five primary information-architecture entries.
 *
 * IA-2: canonical alias paths (`/sessions`, `/work-items`, …) with redirects
 * to existing pages. Brand: CSBU WorkMate.
 */

export type PrimaryNavKey = 'sessions' | 'workItems' | 'agents' | 'skills' | 'batch';

export type PrimaryNavEntry = {
  key: PrimaryNavKey;
  /** i18n key under `common.primaryNav.*` */
  labelKey: `common.primaryNav.${PrimaryNavKey}`;
  /** Canonical deep-link path (alias); legacy routes remain active. */
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
    key: 'workItems',
    labelKey: 'common.primaryNav.workItems',
    path: '/work-items',
    activePrefixes: ['/work-items', '/tasks', '/scheduled'],
    keywords: ['board', 'tasks', 'scheduled', '工作项'],
  },
  {
    key: 'agents',
    labelKey: 'common.primaryNav.agents',
    path: '/agents',
    activePrefixes: ['/agents', '/agent-center', '/assistants'],
    keywords: ['assistant', '智能体', 'agent center'],
  },
  {
    key: 'skills',
    labelKey: 'common.primaryNav.skills',
    path: '/skills',
    activePrefixes: ['/skills', '/skill-evolution', '/settings/skills'],
    keywords: ['skill', 'evolution', '技能'],
  },
  {
    key: 'batch',
    labelKey: 'common.primaryNav.batch',
    path: '/batch',
    activePrefixes: ['/batch'],
    keywords: ['batch jobs', 'bulk', '批量'],
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
