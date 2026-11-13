/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PaletteCommand } from './commandRegistry';

/**
 * E11 PR2 — dynamic palette entries (Sessions, Work items, Agents).
 *
 * Read-only in-app navigation only (D11-k3): every loader goes through an
 * existing renderer bridge the pages already use, never a new route, and every
 * result becomes a `path` the router opens. Loaders fail soft: a rejected or
 * malformed response yields `[]` so the static commands stay usable.
 */

/** How many rows each source keeps in memory (display caps are smaller). */
export const DYNAMIC_SOURCE_CAP = 50;
const SESSIONS_FETCH_LIMIT = 100;

export type DynamicSourceKey = 'sessions' | 'workItems' | 'agents';

const byRecencyDesc = (a: PaletteCommand, b: PaletteCommand) => (b.recency ?? 0) - (a.recency ?? 0);

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export async function loadSessionCommands(): Promise<PaletteCommand[]> {
  const page = await ipcBridge.database.getUserConversations.invoke({ limit: SESSIONS_FETCH_LIMIT });
  const items = Array.isArray(page?.items) ? page.items : [];
  return items
    .filter((conv) => {
      if (!conv || typeof conv.id !== 'string' || !conv.id) return false;
      // Same visibility rule as the sider history: hide health-check and team rows.
      const extra = conv.extra as { is_health_check?: boolean; team_id?: string; teamId?: string } | undefined;
      return extra?.is_health_check !== true && !extra?.team_id && !extra?.teamId;
    })
    .map(
      (conv): PaletteCommand => ({
        id: `session.${conv.id}`,
        title: clean(conv.name),
        group: 'sessions',
        path: `/conversation/${encodeURIComponent(conv.id)}`,
        keywords: [clean(conv.desc), 'session', 'conversation', 'chat'].filter(Boolean),
        recency: typeof conv.modified_at === 'number' ? conv.modified_at : conv.created_at,
      })
    )
    .toSorted(byRecencyDesc)
    .slice(0, DYNAMIC_SOURCE_CAP);
}

export async function loadWorkItemCommands(): Promise<PaletteCommand[]> {
  const [boardResult, cronResult] = await Promise.allSettled([
    ipcBridge.taskSession.board.get.invoke({}),
    ipcBridge.cron.listJobs.invoke(),
  ]);

  const tasks: PaletteCommand[] = [];
  if (boardResult.status === 'fulfilled' && Array.isArray(boardResult.value?.columns)) {
    for (const column of boardResult.value.columns) {
      if (column.board_status === 'cancelled' || !Array.isArray(column.items)) continue;
      for (const item of column.items) {
        if (!item || typeof item.id !== 'string' || !item.id) continue;
        tasks.push({
          id: `workItem.task.${item.id}`,
          title: clean(item.title),
          group: 'workItems',
          path: `/tasks?task=${encodeURIComponent(item.id)}`,
          subtitleKey: `conversation.taskBoard.columns.${column.board_status}`,
          keywords: [...(Array.isArray(item.labels) ? item.labels : []), 'task', 'board', 'work item'],
          recency: item.updated_at,
        });
      }
    }
  } else if (boardResult.status === 'rejected') {
    console.warn('[command-palette] task board unavailable', boardResult.reason);
  }

  const jobs: PaletteCommand[] = [];
  if (cronResult.status === 'fulfilled' && Array.isArray(cronResult.value)) {
    for (const job of cronResult.value) {
      if (!job || typeof job.id !== 'string' || !job.id) continue;
      jobs.push({
        id: `workItem.scheduled.${job.id}`,
        title: clean(job.name),
        group: 'workItems',
        path: `/scheduled/${encodeURIComponent(job.id)}`,
        subtitleKey: job.enabled
          ? 'common.commandPalette.badge.scheduled'
          : 'common.commandPalette.badge.scheduledPaused',
        keywords: [clean(job.description), 'scheduled', 'cron', 'timer'].filter(Boolean),
        recency: job.metadata?.updated_at ?? job.metadata?.created_at,
      });
    }
  } else if (cronResult.status === 'rejected') {
    console.warn('[command-palette] scheduled jobs unavailable', cronResult.reason);
  }

  if (boardResult.status === 'rejected' && cronResult.status === 'rejected') {
    throw boardResult.reason;
  }
  return [...tasks, ...jobs].toSorted(byRecencyDesc).slice(0, DYNAMIC_SOURCE_CAP);
}

/**
 * Agents come from the Agent Center catalog, which the backend already filters
 * by E12 `agent_run_permissions`; the palette only opens the detail page, where
 * running stays behind the existing run-plan gate.
 */
export async function loadAgentCommands(): Promise<PaletteCommand[]> {
  const scopes = ['mine', 'team', 'enterprise'] as const;
  const results = await Promise.allSettled(scopes.map((scope) => ipcBridge.agentCenter.list.invoke({ scope })));
  if (results.every((r) => r.status === 'rejected')) {
    throw (results[0] as PromiseRejectedResult).reason;
  }
  const seen = new Set<string>();
  const out: PaletteCommand[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled' || !Array.isArray(result.value)) continue;
    for (const entry of result.value) {
      const assistant = entry?.assistant;
      if (!assistant || typeof assistant.id !== 'string' || !assistant.id || seen.has(assistant.id)) continue;
      if (assistant.enabled === false) continue;
      seen.add(assistant.id);
      out.push({
        id: `agent.${assistant.id}`,
        title: clean(assistant.name) || assistant.id,
        group: 'agents',
        path: `/agent-center/${encodeURIComponent(assistant.id)}`,
        subtitleKey: 'common.commandPalette.badge.agent',
        keywords: [
          clean(assistant.description),
          ...Object.values(assistant.name_i18n ?? {}),
          'agent',
          'assistant',
        ].filter((k): k is string => typeof k === 'string' && k.length > 0),
        recency: assistant.last_used_at,
      });
    }
  }
  return out.toSorted(byRecencyDesc).slice(0, DYNAMIC_SOURCE_CAP);
}

export const DYNAMIC_LOADERS: Record<DynamicSourceKey, () => Promise<PaletteCommand[]>> = {
  sessions: loadSessionCommands,
  workItems: loadWorkItemCommands,
  agents: loadAgentCommands,
};
