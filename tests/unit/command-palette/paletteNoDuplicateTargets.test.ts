/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { STATIC_PALETTE_COMMANDS } from '@renderer/components/command-palette/commandRegistry';
import { IA_ROUTE_ALIASES } from '@renderer/components/layout/primaryNav/routeAliases';

/** Resolve a palette path through the IA aliases to the page it actually lands on. */
const landing = (path: string): string => {
  const alias = IA_ROUTE_ALIASES.find((a) => a.from === path);
  return alias ? alias.to : path;
};

describe('command palette static targets (3.0 V16)', () => {
  it('never lists two commands that land on the same page', () => {
    const seen = new Map<string, string>();
    for (const cmd of STATIC_PALETTE_COMMANDS) {
      if (!cmd.path) continue;
      const target = landing(cmd.path);
      expect(seen.get(target), `${cmd.id} duplicates ${seen.get(target)} (${target})`).toBeUndefined();
      seen.set(target, cmd.id);
    }
  });

  it('keeps sessions and scheduled reachable by keyword', () => {
    const newChat = STATIC_PALETTE_COMMANDS.find((c) => c.id === 'nav.new-chat');
    const automations = STATIC_PALETTE_COMMANDS.find((c) => c.id === 'nav.primary.automations');
    expect(newChat?.keywords).toEqual(expect.arrayContaining(['sessions', 'history']));
    expect(automations?.keywords).toEqual(expect.arrayContaining(['scheduled', 'schedule']));
  });
});
