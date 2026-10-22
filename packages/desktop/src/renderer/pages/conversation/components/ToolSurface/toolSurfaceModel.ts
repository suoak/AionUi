/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationToolSurface, IToolSurfaceEntry, ToolSurfaceKind } from '@/common/adapter/ipcBridge';

export type McpStatusTone = 'ok' | 'failed' | 'missing' | 'disabled' | 'unknown';

export type ToolSurfaceMcpGroup = {
  server: string;
  status?: string;
  tone: McpStatusTone;
  external: boolean;
  tools: IToolSurfaceEntry[];
};

export type ToolSurfaceGroups = {
  builtin: IToolSurfaceEntry[];
  mcp: ToolSurfaceMcpGroup[];
  skill: IToolSurfaceEntry[];
  externalServers: string[];
  total: number;
};

/** Map backend status wording onto a small set of display tones. */
export const mcpStatusTone = (status: string | undefined): McpStatusTone => {
  const value = (status ?? '').trim().toLowerCase();
  if (!value || value === 'unknown') return 'unknown';
  if (value.startsWith('missing')) return 'missing';
  if (['connected', 'ready', 'running', 'ok', 'active'].includes(value)) return 'ok';
  if (value === 'disabled') return 'disabled';
  if (['failed', 'error', 'cancelled', 'needs-auth', 'needs_auth'].includes(value) || value.startsWith('failed'))
    return 'failed';
  return 'unknown';
};

/**
 * Older Core builds report only `tools`. Derive entries from the canonical
 * `mcp__<server>__<tool>` spelling; anything else counts as builtin.
 */
export const entriesFromToolNames = (tools: string[]): IToolSurfaceEntry[] =>
  tools.map((name) => {
    const match = /^mcp__(.+?)__(.+)$/.exec(name);
    if (match) return { name, canonical: name, kind: 'mcp' as ToolSurfaceKind, server: match[1] };
    return { name, canonical: name, kind: 'builtin' as ToolSurfaceKind };
  });

const byName = (a: IToolSurfaceEntry, b: IToolSurfaceEntry) => a.name.localeCompare(b.name);

/** Group a reported surface into builtin / MCP (per server) / skills. */
export const groupToolSurface = (surface: IConversationToolSurface): ToolSurfaceGroups => {
  const entries = surface.entries && surface.entries.length > 0 ? surface.entries : entriesFromToolNames(surface.tools);
  const servers = surface.mcp_servers ?? [];
  const externalServers = Array.from(
    new Set([...(surface.external_mcp_servers ?? []), ...servers.filter((s) => s.external).map((s) => s.name)])
  );

  const mcpByServer = new Map<string, ToolSurfaceMcpGroup>();
  const ensureServer = (server: string): ToolSurfaceMcpGroup => {
    let group = mcpByServer.get(server);
    if (!group) {
      group = { server, tone: 'unknown', external: externalServers.includes(server), tools: [] };
      mcpByServer.set(server, group);
    }
    return group;
  };
  // Reported servers first, so failed / missing servers with no tools still show.
  for (const reported of servers) {
    const group = ensureServer(reported.name);
    group.status = reported.status;
    group.tone = mcpStatusTone(reported.status);
  }

  const builtin: IToolSurfaceEntry[] = [];
  const skill: IToolSurfaceEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === 'skill') skill.push(entry);
    else if (entry.kind === 'mcp') ensureServer(entry.server ?? '').tools.push(entry);
    else builtin.push(entry);
  }

  for (const group of mcpByServer.values()) group.tools = group.tools.toSorted(byName);
  const mcp = Array.from(mcpByServer.values()).toSorted(
    (a, b) => Number(b.external) - Number(a.external) || a.server.localeCompare(b.server)
  );

  return {
    builtin: builtin.toSorted(byName),
    mcp,
    skill: skill.toSorted(byName),
    externalServers,
    total: entries.length,
  };
};
