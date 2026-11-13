/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  conversations: vi.fn(),
  board: vi.fn(),
  cron: vi.fn(),
  agents: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: { getUserConversations: { invoke: mocks.conversations } },
    taskSession: { board: { get: { invoke: mocks.board } } },
    cron: { listJobs: { invoke: mocks.cron } },
    agentCenter: { list: { invoke: mocks.agents } },
  },
}));

import {
  DYNAMIC_SOURCE_CAP,
  loadAgentCommands,
  loadSessionCommands,
  loadWorkItemCommands,
} from '@/renderer/components/command-palette/dynamicCommands';

const conv = (id: string, extra: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => ({
  id,
  name: `Chat ${id}`,
  created_at: 1,
  modified_at: 1,
  extra,
  ...more,
});

const boardOf = (columns: Record<string, Array<Record<string, unknown>>>) => ({
  columns: Object.entries(columns).map(([board_status, items]) => ({ board_status, items })),
});

const agent = (id: string, more: Record<string, unknown> = {}) => ({
  assistant: { id, name: `Agent ${id}`, name_i18n: {}, enabled: true, ...more },
  meta: {},
});

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('loadSessionCommands', () => {
  it('maps conversations to /conversation/:id ordered by recency and hides health-check/team rows', async () => {
    mocks.conversations.mockResolvedValue({
      items: [
        conv('old', {}, { modified_at: 10 }),
        conv('new', {}, { modified_at: 99, desc: 'quarterly report' }),
        conv('hc', { is_health_check: true }),
        conv('team', { team_id: 't1' }),
        conv('team2', { teamId: 't2' }),
        conv('a/b', {}, { modified_at: 50, name: '  ' }),
      ],
      total: 6,
      has_more: false,
    });
    const cmds = await loadSessionCommands();
    expect(mocks.conversations).toHaveBeenCalledWith({ limit: 100 });
    expect(cmds.map((c) => c.id)).toEqual(['session.new', 'session.a/b', 'session.old']);
    expect(cmds[0]).toMatchObject({ group: 'sessions', path: '/conversation/new', title: 'Chat new' });
    expect(cmds[0].keywords).toContain('quarterly report');
    expect(cmds[1]).toMatchObject({ path: '/conversation/a%2Fb', title: '' });
  });

  it('caps the in-memory list and tolerates malformed pages', async () => {
    mocks.conversations.mockResolvedValue({
      items: Array.from({ length: 80 }, (_, i) => conv(`c${i}`, {}, { modified_at: i })),
    });
    expect(await loadSessionCommands()).toHaveLength(DYNAMIC_SOURCE_CAP);
    mocks.conversations.mockResolvedValue(null);
    expect(await loadSessionCommands()).toEqual([]);
    mocks.conversations.mockResolvedValue({ items: [null, { id: '' }, conv('ok')] });
    expect((await loadSessionCommands()).map((c) => c.id)).toEqual(['session.ok']);
  });

  it('propagates bridge failures so the hook can mark the source as failed', async () => {
    mocks.conversations.mockRejectedValue(new Error('offline'));
    await expect(loadSessionCommands()).rejects.toThrow('offline');
  });
});

describe('loadWorkItemCommands', () => {
  it('merges board items (minus cancelled) and scheduled jobs with deep-link paths', async () => {
    mocks.board.mockResolvedValue(
      boardOf({
        todo: [{ id: 't1', title: 'Write spec', labels: ['docs'], updated_at: 30 }],
        in_review: [{ id: 't 2', title: 'Review PR', labels: [], updated_at: 40 }],
        cancelled: [{ id: 'gone', title: 'Dropped', labels: [], updated_at: 99 }],
      })
    );
    mocks.cron.mockResolvedValue([
      { id: 'j1', name: 'Daily digest', enabled: true, metadata: { updated_at: 35 } },
      { id: 'j2', name: 'Weekly', enabled: false, metadata: { created_at: 5 } },
    ]);
    const cmds = await loadWorkItemCommands();
    expect(cmds.map((c) => c.id)).toEqual([
      'workItem.task.t 2',
      'workItem.scheduled.j1',
      'workItem.task.t1',
      'workItem.scheduled.j2',
    ]);
    expect(cmds.find((c) => c.id === 'workItem.task.t 2')).toMatchObject({
      group: 'workItems',
      path: '/tasks?task=t%202',
      subtitleKey: 'conversation.taskBoard.columns.in_review',
    });
    expect(cmds.find((c) => c.id === 'workItem.task.t1')?.keywords).toContain('docs');
    expect(cmds.find((c) => c.id === 'workItem.scheduled.j1')).toMatchObject({
      path: '/scheduled/j1',
      subtitleKey: 'common.commandPalette.badge.scheduled',
    });
    expect(cmds.find((c) => c.id === 'workItem.scheduled.j2')?.subtitleKey).toBe(
      'common.commandPalette.badge.scheduledPaused'
    );
    expect(mocks.board).toHaveBeenCalledWith({});
  });

  it('keeps scheduled jobs when the board API fails (and vice versa)', async () => {
    mocks.board.mockRejectedValue(new Error('no board'));
    mocks.cron.mockResolvedValue([{ id: 'j1', name: 'Digest', enabled: true, metadata: {} }]);
    expect((await loadWorkItemCommands()).map((c) => c.id)).toEqual(['workItem.scheduled.j1']);

    mocks.board.mockResolvedValue(boardOf({ todo: [{ id: 't1', title: 'A', labels: [], updated_at: 1 }] }));
    mocks.cron.mockRejectedValue(new Error('no cron'));
    expect((await loadWorkItemCommands()).map((c) => c.id)).toEqual(['workItem.task.t1']);
  });

  it('rejects only when both sources fail', async () => {
    mocks.board.mockRejectedValue(new Error('no board'));
    mocks.cron.mockRejectedValue(new Error('no cron'));
    await expect(loadWorkItemCommands()).rejects.toThrow('no board');
  });
});

describe('loadAgentCommands', () => {
  it('merges permission-filtered catalog scopes, dedupes and skips disabled agents', async () => {
    mocks.agents.mockImplementation(({ scope }: { scope: string }) => {
      if (scope === 'mine')
        return Promise.resolve([agent('a1', { last_used_at: 5 }), agent('off', { enabled: false })]);
      if (scope === 'team') return Promise.resolve([agent('a1'), agent('a2', { name_i18n: { 'zh-CN': '写作助手' } })]);
      return Promise.reject(new Error('forbidden'));
    });
    const cmds = await loadAgentCommands();
    expect(mocks.agents.mock.calls.map((c) => c[0])).toEqual([
      { scope: 'mine' },
      { scope: 'team' },
      { scope: 'enterprise' },
    ]);
    expect(cmds.map((c) => c.id)).toEqual(['agent.a1', 'agent.a2']);
    expect(cmds[0]).toMatchObject({ group: 'agents', path: '/agent-center/a1', title: 'Agent a1' });
    expect(cmds[1].keywords).toContain('写作助手');
  });

  it('rejects when every scope fails', async () => {
    mocks.agents.mockRejectedValue(new Error('down'));
    await expect(loadAgentCommands()).rejects.toThrow('down');
  });
});
