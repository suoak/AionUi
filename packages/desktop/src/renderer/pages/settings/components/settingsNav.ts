/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 3.0 V7: settings are arranged in six groups (General · Models & agent
 * runtime · Workspace & connections · Extensions · Team & governance · About)
 * with a search box. Every tab keeps its `/settings/{id}` route.
 *
 * Pure data and helpers so the sider, the mobile top nav and tests share one
 * ordering.
 */

import type { IExtensionSettingsTab } from '@/common/adapter/ipcBridge';

export type SettingsGroupId = 'general' | 'runtime' | 'workspace' | 'extensions' | 'team' | 'about';

export type SettingsGroup = {
  id: SettingsGroupId;
  /** i18n key under `settings.groups.*` */
  labelKey: `settings.groups.${SettingsGroupId}`;
  /** Builtin tab ids in display order. `extensions` is filled by extension tabs. */
  tabs: readonly string[];
};

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  { id: 'general', labelKey: 'settings.groups.general', tabs: ['appearance', 'system', 'pet'] },
  { id: 'runtime', labelKey: 'settings.groups.runtime', tabs: ['model', 'agent', 'tools', 'skills'] },
  { id: 'workspace', labelKey: 'settings.groups.workspace', tabs: ['webui', 'devices', 'local-kb'] },
  { id: 'extensions', labelKey: 'settings.groups.extensions', tabs: [] },
  { id: 'team', labelKey: 'settings.groups.team', tabs: ['governance', 'usage', 'archived'] },
  { id: 'about', labelKey: 'settings.groups.about', tabs: ['about'] },
];

/** Builtin tab ids in display order (group order, then tab order). */
export const SETTINGS_TAB_ORDER: readonly string[] = SETTINGS_GROUPS.flatMap((group) => group.tabs);

const GROUP_OF_TAB: ReadonlyMap<string, SettingsGroupId> = new Map(
  SETTINGS_GROUPS.flatMap((group) => group.tabs.map((tab) => [tab, group.id] as const))
);

export const settingsGroupOfTab = (tabId: string): SettingsGroupId | undefined => GROUP_OF_TAB.get(tabId);

/**
 * Extra search words per builtin tab (English; the localized label and group
 * name are always searched too).
 */
export const SETTINGS_TAB_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  appearance: ['theme', 'dark', 'light', 'font', 'zoom', 'css', 'dusk', 'ember'],
  system: ['language', 'startup', 'proxy', 'update', 'tray', 'remote', 'host', 'log'],
  pet: ['desktop pet'],
  model: ['provider', 'api key', 'llm', 'openai', 'anthropic', 'gemini'],
  agent: ['acp', 'cli', 'claude', 'codex', 'preflight', 'runtime'],
  tools: ['mcp', 'server', 'tool'],
  skills: ['skill', 'hub'],
  webui: ['web', 'browser', 'port', 'remote access', 'im', 'channel', 'telegram', 'lark', 'slack'],
  devices: ['phone', 'pair', 'mobile', 'approval'],
  'local-kb': ['knowledge', 'kb', 'documents', 'index'],
  governance: ['policy', 'audit', 'yolo', 'permission', 'admin'],
  usage: ['tokens', 'cost', 'quota', 'spend'],
  archived: ['archive', 'history'],
  about: ['version', 'feedback', 'diagnostics', 'license'],
};

export type ArrangedSettingsItem<T> = { item: T; group: SettingsGroupId };

/**
 * Orders builtin items by group and places extension tabs: anchored tabs go
 * before / after their (remapped) anchor and join its group; unanchored ones
 * (or ones whose anchor is hidden) form the Extensions group.
 */
export function arrangeSettingsNav<T extends { id: string }>(
  builtins: readonly T[],
  extensionTabs: readonly IExtensionSettingsTab[],
  toItem: (tab: IExtensionSettingsTab) => T,
  legacyAnchorRemap: Readonly<Record<string, string>> = {}
): ArrangedSettingsItem<T>[] {
  const visible = new Map(builtins.map((item) => [item.id, item]));
  const ordered = SETTINGS_TAB_ORDER.filter((id) => visible.has(id)).map((id) => visible.get(id)!);
  // Builtins that are not in any group (future tabs) keep their order at the end of "about".
  for (const item of builtins) {
    if (!GROUP_OF_TAB.has(item.id)) ordered.push(item);
  }

  const before = new Map<string, IExtensionSettingsTab[]>();
  const after = new Map<string, IExtensionSettingsTab[]>();
  const unanchored: IExtensionSettingsTab[] = [];
  for (const tab of extensionTabs) {
    const rawAnchor = tab.position?.relativeTo;
    const anchor = rawAnchor ? (legacyAnchorRemap[rawAnchor] ?? rawAnchor) : undefined;
    if (!anchor || !visible.has(anchor)) {
      unanchored.push(tab);
      continue;
    }
    const map = tab.position?.placement === 'before' ? before : after;
    map.set(anchor, [...(map.get(anchor) ?? []), tab]);
  }

  const result: ArrangedSettingsItem<T>[] = [];
  let extensionsPlaced = false;
  const placeExtensions = () => {
    if (extensionsPlaced) return;
    extensionsPlaced = true;
    for (const tab of unanchored) result.push({ item: toItem(tab), group: 'extensions' });
  };
  for (const item of ordered) {
    const group = GROUP_OF_TAB.get(item.id) ?? 'about';
    if (SETTINGS_GROUPS.findIndex((g) => g.id === group) > SETTINGS_GROUPS.findIndex((g) => g.id === 'extensions')) {
      placeExtensions();
    }
    for (const tab of before.get(item.id) ?? []) result.push({ item: toItem(tab), group });
    result.push({ item, group });
    for (const tab of after.get(item.id) ?? []) result.push({ item: toItem(tab), group });
  }
  placeExtensions();
  return result;
}

const normalize = (value: string): string => value.normalize('NFKC').toLocaleLowerCase().trim();

/**
 * Filters arranged items by a search query: every whitespace-separated term
 * must match the label, the tab id, its keywords or the group name.
 */
export function filterSettingsNav<T extends { id: string; label: string }>(
  items: readonly ArrangedSettingsItem<T>[],
  query: string,
  groupLabel: (group: SettingsGroupId) => string
): ArrangedSettingsItem<T>[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...items];
  return items.filter(({ item, group }) => {
    const haystack = normalize(
      [item.label, item.id, groupLabel(group), ...(SETTINGS_TAB_KEYWORDS[item.id] ?? [])].join(' ')
    );
    return terms.every((term) => haystack.includes(term));
  });
}
