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

describe('primaryNav — 3.0 IA five entries (U1)', () => {
  it('exposes exactly five primary entries in canonical order', () => {
    expect(PRIMARY_NAV_ENTRIES.map((e) => e.key)).toEqual(['sessions', 'tasks', 'agents', 'skills', 'automations']);
  });

  it('maps keys to canonical routes', () => {
    expect(primaryNavEntryByKey('sessions').path).toBe('/sessions');
    expect(primaryNavEntryByKey('tasks').path).toBe('/tasks');
    expect(primaryNavEntryByKey('agents').path).toBe('/agents');
    expect(primaryNavEntryByKey('skills').path).toBe('/skills');
    expect(primaryNavEntryByKey('automations').path).toBe('/automations');
  });

  it('highlights conversation under sessions only', () => {
    const sessions = primaryNavEntryByKey('sessions');
    expect(isPrimaryNavActive(sessions, '/conversation/abc')).toBe(true);
    expect(isPrimaryNavActive(sessions, '/sessions')).toBe(true);
    expect(isPrimaryNavActive(sessions, '/tasks')).toBe(false);
  });

  it('tasks covers /tasks and the legacy /work-items alias, not automations', () => {
    const tasks = primaryNavEntryByKey('tasks');
    expect(isPrimaryNavActive(tasks, '/tasks')).toBe(true);
    expect(isPrimaryNavActive(tasks, '/tasks/xyz')).toBe(true);
    expect(isPrimaryNavActive(tasks, '/work-items')).toBe(true);
    expect(isPrimaryNavActive(tasks, '/scheduled')).toBe(false);
    expect(isPrimaryNavActive(tasks, '/batch')).toBe(false);
  });

  it('automations covers scheduled and batch', () => {
    const automations = primaryNavEntryByKey('automations');
    expect(isPrimaryNavActive(automations, '/automations')).toBe(true);
    expect(isPrimaryNavActive(automations, '/scheduled')).toBe(true);
    expect(isPrimaryNavActive(automations, '/scheduled/job-1')).toBe(true);
    expect(isPrimaryNavActive(automations, '/batch')).toBe(true);
    expect(isPrimaryNavActive(automations, '/tasks')).toBe(false);
  });

  it('agents covers /agents and the legacy /agent-center alias', () => {
    const agents = primaryNavEntryByKey('agents');
    expect(isPrimaryNavActive(agents, '/agents')).toBe(true);
    expect(isPrimaryNavActive(agents, '/agents/abc/edit')).toBe(true);
    expect(isPrimaryNavActive(agents, '/agent-center')).toBe(true);
  });
});
