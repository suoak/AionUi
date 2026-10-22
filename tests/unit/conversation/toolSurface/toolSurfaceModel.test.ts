/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IConversationToolSurface } from '@/common/adapter/ipcBridge';
import {
  entriesFromToolNames,
  groupToolSurface,
  mcpStatusTone,
} from '@/renderer/pages/conversation/components/ToolSurface/toolSurfaceModel';

const surface = (overrides: Partial<IConversationToolSurface> = {}): IConversationToolSurface => ({
  source: 'claude_init',
  tools: [],
  mcp_isolation: 'strict',
  ...overrides,
});

describe('groupToolSurface', () => {
  it('groups normalized entries into builtin / MCP per server / skills', () => {
    const groups = groupToolSurface(
      surface({
        tools: ['Read', 'Bash', 'mcp__docs__search'],
        entries: [
          { name: 'Read', canonical: 'Read', kind: 'builtin' },
          { name: 'Bash', canonical: 'Bash', kind: 'builtin' },
          { name: 'search', canonical: 'mcp__docs__search', kind: 'mcp', server: 'docs' },
          { name: 'mcp__docs_fetch', canonical: 'mcp__docs__fetch', kind: 'mcp', server: 'docs' },
          { name: 'lights', canonical: 'mcp__home__lights', kind: 'mcp', server: 'home' },
          { name: 'pdf', canonical: 'skill:pdf', kind: 'skill' },
        ],
        mcp_servers: [
          { name: 'docs', status: 'connected' },
          { name: 'home', status: 'connected' },
        ],
      })
    );
    expect(groups.builtin.map((e) => e.name)).toEqual(['Bash', 'Read']);
    expect(groups.skill.map((e) => e.canonical)).toEqual(['skill:pdf']);
    expect(groups.mcp.map((g) => g.server)).toEqual(['docs', 'home']);
    expect(groups.mcp[0].tools.map((e) => e.canonical)).toEqual(['mcp__docs__fetch', 'mcp__docs__search']);
    expect(groups.mcp[0].tone).toBe('ok');
    expect(groups.externalServers).toEqual([]);
    expect(groups.total).toBe(6);
  });

  it('keeps failed and missing servers that reported no tools', () => {
    const groups = groupToolSurface(
      surface({
        mcp_servers: [
          { name: 'broken', status: 'failed' },
          { name: 'gone', status: 'missing: gone' },
        ],
      })
    );
    expect(groups.mcp.map((g) => [g.server, g.tone, g.tools.length])).toEqual([
      ['broken', 'failed', 0],
      ['gone', 'missing', 0],
    ]);
  });

  it('collects external servers from both the hint list and per-server flags, external first', () => {
    const groups = groupToolSurface(
      surface({
        source: 'codex_mcp_status',
        mcp_isolation: 'ambient',
        tools: ['mcp__a__x', 'mcp__z__y'],
        mcp_servers: [
          { name: 'a', status: 'connected' },
          { name: 'z', status: 'connected', external: true },
        ],
        external_mcp_servers: ['z'],
      })
    );
    expect(groups.externalServers).toEqual(['z']);
    expect(groups.mcp.map((g) => [g.server, g.external])).toEqual([
      ['z', true],
      ['a', false],
    ]);
  });

  it('derives groups from bare tool names when an older Core sends no entries', () => {
    expect(entriesFromToolNames(['Read', 'mcp__fs__read_file'])).toEqual([
      { name: 'Read', canonical: 'Read', kind: 'builtin' },
      { name: 'mcp__fs__read_file', canonical: 'mcp__fs__read_file', kind: 'mcp', server: 'fs' },
    ]);
    const groups = groupToolSurface(surface({ tools: ['Read', 'mcp__fs__read_file'] }));
    expect(groups.builtin).toHaveLength(1);
    expect(groups.mcp.map((g) => g.server)).toEqual(['fs']);
  });
});

describe('mcpStatusTone', () => {
  it.each([
    ['connected', 'ok'],
    ['ready', 'ok'],
    ['failed', 'failed'],
    ['cancelled', 'failed'],
    ['missing: docs', 'missing'],
    ['disabled', 'disabled'],
    [undefined, 'unknown'],
    ['starting', 'unknown'],
  ])('%s → %s', (status, tone) => {
    expect(mcpStatusTone(status)).toBe(tone);
  });
});
