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

describe('primaryNav IA-0/IA-1/IA-2', () => {
  it('exposes exactly five primary entries in canonical order', () => {
    expect(PRIMARY_NAV_ENTRIES.map((e) => e.key)).toEqual(['sessions', 'workItems', 'agents', 'skills', 'batch']);
  });

  it('maps keys to canonical alias routes', () => {
    expect(primaryNavEntryByKey('sessions').path).toBe('/sessions');
    expect(primaryNavEntryByKey('workItems').path).toBe('/work-items');
    expect(primaryNavEntryByKey('agents').path).toBe('/agents');
    expect(primaryNavEntryByKey('skills').path).toBe('/skills');
    expect(primaryNavEntryByKey('batch').path).toBe('/batch');
  });

  it('highlights conversation under sessions and scheduled under work items', () => {
    const sessions = primaryNavEntryByKey('sessions');
    const workItems = primaryNavEntryByKey('workItems');
    expect(isPrimaryNavActive(sessions, '/conversation/abc')).toBe(true);
    expect(isPrimaryNavActive(sessions, '/sessions')).toBe(true);
    expect(isPrimaryNavActive(sessions, '/tasks')).toBe(false);
    expect(isPrimaryNavActive(workItems, '/scheduled/job-1')).toBe(true);
    expect(isPrimaryNavActive(workItems, '/work-items')).toBe(true);
    expect(isPrimaryNavActive(workItems, '/batch')).toBe(false);
  });

  it('workItems activePrefixes cover aliases, /tasks and /scheduled', () => {
    const workItems = primaryNavEntryByKey('workItems');
    expect(isPrimaryNavActive(workItems, '/tasks')).toBe(true);
    expect(isPrimaryNavActive(workItems, '/tasks/xyz')).toBe(true);
    expect(isPrimaryNavActive(workItems, '/scheduled')).toBe(true);
    expect(isPrimaryNavActive(workItems, '/work-items/scheduled')).toBe(true);
  });
});
