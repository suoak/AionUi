/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IExtensionInfo } from '@/common/adapter/ipcBridge';
import {
  countContributions,
  filterExtensions,
  isKnownSource,
  normalizePermissions,
  sortExtensions,
} from '@/renderer/pages/settings/ExtensionsSettings/extensionsModel';

const ext = (name: string, display_name = '', description?: string): IExtensionInfo => ({
  name,
  display_name,
  version: '1.0.0',
  description,
  source: 'local',
  enabled: true,
});

describe('Installed extensions model (3.0 V7)', () => {
  it('counts contributions per extension and ignores entries without a name', () => {
    const counts = countContributions({
      settingsTabs: [{ extensionName: 'a' }, { extensionName: 'a' }, {}],
      commands: [{ extensionName: 'b' }],
      panels: null,
      views: [{ extensionName: 'a' }],
    });
    expect(counts.get('a')).toEqual({ settingsTabs: 2, commands: 0, panels: 0, views: 1 });
    expect(counts.get('b')).toEqual({ settingsTabs: 0, commands: 1, panels: 0, views: 0 });
    expect(counts.has('')).toBe(false);
  });

  it('normalizes the Core 0.5 permissions shape and tolerates junk', () => {
    expect(
      normalizePermissions({
        permissions: {},
        risk_level: 'moderate',
        details: [{ permission: 'network', level: 'limited', description: 'Fetch' }, null, { level: 'full' }],
      })
    ).toEqual({ riskLevel: 'moderate', details: [{ permission: 'network', level: 'limited', description: 'Fetch' }] });
    expect(normalizePermissions({ riskLevel: 'nope' })).toEqual({ riskLevel: undefined, details: [] });
    expect(normalizePermissions([])).toEqual({ riskLevel: undefined, details: [] });
    expect(normalizePermissions(null)).toEqual({ details: [] });
  });

  it('sorts by display name and filters on name, display name and description', () => {
    const list = [ext('zeta', 'Alpha'), ext('beta'), ext('gamma', 'Gamma', 'Talks to Jira')];
    expect(sortExtensions(list).map((e) => e.name)).toEqual(['zeta', 'beta', 'gamma']);
    expect(filterExtensions(list, 'jira').map((e) => e.name)).toEqual(['gamma']);
    expect(filterExtensions(list, 'ALP').map((e) => e.name)).toEqual(['zeta']);
    expect(filterExtensions(list, '  ')).toHaveLength(3);
  });

  it('knows the Core source values', () => {
    expect(['local', 'appdata', 'env'].every(isKnownSource)).toBe(true);
    expect(isKnownSource('hub')).toBe(false);
  });
});
