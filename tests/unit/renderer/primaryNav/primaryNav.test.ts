/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  PRIMARY_NAV_ENTRIES,
  isPrimaryNavActive,
  primaryNavEntryByKey,
} from '@renderer/components/layout/primaryNav/primaryNav';

describe('primaryNav IA-0', () => {
  it('exposes exactly five primary entries in canonical order', () => {
    expect(PRIMARY_NAV_ENTRIES.map((e) => e.key)).toEqual(['sessions', 'workItems', 'agents', 'skills', 'batch']);
  });

  it('maps keys to existing desktop routes', () => {
    expect(primaryNavEntryByKey('sessions').path).toBe('/guid');
    expect(primaryNavEntryByKey('workItems').path).toBe('/tasks');
    expect(primaryNavEntryByKey('agents').path).toBe('/agent-center');
    expect(primaryNavEntryByKey('skills').path).toBe('/skill-evolution');
    expect(primaryNavEntryByKey('batch').path).toBe('/batch');
  });

  it('highlights conversation under sessions and scheduled under work items', () => {
    const sessions = primaryNavEntryByKey('sessions');
    const workItems = primaryNavEntryByKey('workItems');
    expect(isPrimaryNavActive(sessions, '/conversation/abc')).toBe(true);
    expect(isPrimaryNavActive(sessions, '/tasks')).toBe(false);
    expect(isPrimaryNavActive(workItems, '/scheduled/job-1')).toBe(true);
    expect(isPrimaryNavActive(workItems, '/batch')).toBe(false);
  });
});
