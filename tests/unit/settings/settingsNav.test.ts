/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import {
  arrangeSettingsNav,
  filterSettingsNav,
  SETTINGS_GROUPS,
  SETTINGS_TAB_ORDER,
  settingsGroupOfTab,
} from '@/renderer/pages/settings/components/settingsNav';
import { BUILTIN_TAB_IDS, LEGACY_ANCHOR_REMAP } from '@/renderer/pages/settings/components/SettingsSider';

type Item = { id: string; label: string };

const builtin = (id: string): Item => ({ id, label: id });
const ext = (id: string, position?: IExtensionSettingsTab['position']): IExtensionSettingsTab =>
  ({ id, name: id, position }) as unknown as IExtensionSettingsTab;
const toItem = (tab: IExtensionSettingsTab): Item => ({ id: tab.id, label: `ext:${tab.id}` });

describe('settingsNav (3.0 V7)', () => {
  it('has six groups that cover every builtin tab exactly once', () => {
    expect(SETTINGS_GROUPS.map((g) => g.id)).toEqual([
      'general',
      'runtime',
      'workspace',
      'extensions',
      'team',
      'about',
    ]);
    expect([...SETTINGS_TAB_ORDER].sort()).toEqual([...BUILTIN_TAB_IDS].sort());
    expect(SETTINGS_TAB_ORDER).toEqual([...BUILTIN_TAB_IDS]);
    expect(new Set(SETTINGS_TAB_ORDER).size).toBe(SETTINGS_TAB_ORDER.length);
    expect(settingsGroupOfTab('devices')).toBe('workspace');
    expect(settingsGroupOfTab('governance')).toBe('team');
  });

  it('orders builtins by group and hides tabs that are not visible', () => {
    const arranged = arrangeSettingsNav(['about', 'model', 'appearance', 'usage'].map(builtin), [], toItem);
    expect(arranged.map(({ item, group }) => `${group}:${item.id}`)).toEqual([
      'general:appearance',
      'runtime:model',
      'team:usage',
      'about:about',
    ]);
  });

  it('keeps anchored extension tabs next to their anchor and groups the rest under Extensions', () => {
    const arranged = arrangeSettingsNav(
      ['appearance', 'model', 'skills', 'webui', 'governance', 'about'].map(builtin),
      [
        ext('before-model', { relativeTo: 'model', placement: 'before' }),
        ext('legacy', { relativeTo: 'skills-hub', placement: 'after' }),
        ext('free'),
        ext('hidden-anchor', { relativeTo: 'pet', placement: 'after' }),
      ],
      toItem,
      LEGACY_ANCHOR_REMAP
    );
    expect(arranged.map(({ item, group }) => `${group}:${item.id}`)).toEqual([
      'general:appearance',
      'runtime:before-model',
      'runtime:model',
      'runtime:skills',
      'runtime:legacy',
      'workspace:webui',
      'extensions:free',
      'extensions:hidden-anchor',
      'team:governance',
      'about:about',
    ]);
  });

  it('places the Extensions group even when no later group is visible', () => {
    const arranged = arrangeSettingsNav(['appearance'].map(builtin), [ext('free')], toItem);
    expect(arranged.map(({ group }) => group)).toEqual(['general', 'extensions']);
  });

  it('search matches every term against label, id, keywords and group name', () => {
    const arranged = arrangeSettingsNav(['appearance', 'model', 'tools', 'devices'].map(builtin), [], toItem);
    const label = (group: string) => ({ general: 'Allgemein', runtime: 'Laufzeit' })[group] ?? group;
    const ids = (query: string) => filterSettingsNav(arranged, query, label).map(({ item }) => item.id);
    expect(ids('')).toEqual(['appearance', 'model', 'tools', 'devices']);
    expect(ids('  MCP ')).toEqual(['tools']);
    expect(ids('dark theme')).toEqual(['appearance']);
    expect(ids('allgemein')).toEqual(['appearance']);
    expect(ids('pair phone')).toEqual(['devices']);
    expect(ids('nothing-like-this')).toEqual([]);
  });
});
