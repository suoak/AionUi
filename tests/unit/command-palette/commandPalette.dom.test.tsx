/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
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

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key,
    i18n: { language: 'en-US' },
  }),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

import CommandPalette from '@/renderer/components/command-palette/CommandPalette';
import {
  PALETTE_DYNAMIC_TTL_MS,
  resetPaletteDynamicCache,
} from '@/renderer/components/command-palette/usePaletteDynamicCommands';

const conversationsPage = (...names: string[]) => ({
  items: names.map((name, i) => ({ id: `c${i}`, name, created_at: i, modified_at: 100 - i, extra: {} })),
  total: names.length,
  has_more: false,
});

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const input = () =>
  screen.getByTestId('command-palette-input').querySelector('input') ?? screen.getByTestId('command-palette-input');
const type = (value: string) => fireEvent.change(input(), { target: { value } });
const key = (k: string) => fireEvent.keyDown(input(), { key: k });
const groups = () =>
  Array.from(document.querySelectorAll('[data-testid^="command-palette-group-"]')).map((n) =>
    (n as HTMLElement).dataset.testid!.replace('command-palette-group-', '')
  );
const selectedId = () =>
  (document.querySelector('[role="option"][aria-selected="true"]') as HTMLElement | null)?.dataset.testid;

const seedDefaults = () => {
  mocks.conversations.mockResolvedValue(conversationsPage('Quarterly report', 'Budget review'));
  mocks.board.mockResolvedValue({
    columns: [{ board_status: 'todo', items: [{ id: 't1', title: 'Ship palette', labels: [], updated_at: 5 }] }],
  });
  mocks.cron.mockResolvedValue([{ id: 'j1', name: 'Daily digest', enabled: true, metadata: { updated_at: 1 } }]);
  mocks.agents.mockImplementation(({ scope }: { scope: string }) =>
    Promise.resolve(
      scope === 'mine' ? [{ assistant: { id: 'a1', name: 'Writer', name_i18n: {}, enabled: true }, meta: {} }] : []
    )
  );
};

describe('CommandPalette dynamic groups (E11 PR2)', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    resetPaletteDynamicCache();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    seedDefaults();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loads sessions, work items and agents when opened and renders groups in order', async () => {
    render(<CommandPalette open onClose={vi.fn()} />);
    await screen.findByTestId('command-palette-item-session.c0');
    await screen.findByTestId('command-palette-item-workItem.task.t1');
    await screen.findByTestId('command-palette-item-agent.a1');
    expect(groups()).toEqual(['navigation', 'sessions', 'workItems', 'agents', 'settings']);
    const sessions = screen.getByTestId('command-palette-group-sessions');
    expect(within(sessions).getByText('Sessions')).toBeTruthy();
    expect(within(sessions).getByText('Quarterly report')).toBeTruthy();
    expect(
      within(screen.getByTestId('command-palette-group-workItems')).getByText('common.commandPalette.badge.scheduled')
    ).toBeTruthy();
  });

  it('does not touch any bridge while closed or when dynamic loading is disabled', () => {
    const { rerender } = render(<CommandPalette open={false} onClose={vi.fn()} />);
    rerender(<CommandPalette open dynamic={false} onClose={vi.fn()} />);
    expect(mocks.conversations).not.toHaveBeenCalled();
    expect(mocks.board).not.toHaveBeenCalled();
    expect(mocks.agents).not.toHaveBeenCalled();
    expect(groups()).toEqual(['navigation', 'agents', 'settings']);
  });

  it('filters across groups and navigates to the session on Enter', async () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} />);
    await screen.findByTestId('command-palette-item-session.c1');
    type('budget');
    expect(groups()).toEqual(['sessions']);
    expect(selectedId()).toBe('command-palette-item-session.c1');
    key('Enter');
    expect(mocks.navigate).toHaveBeenCalledWith('/conversation/c1');
    expect(onClose).toHaveBeenCalled();
  });

  it('arrow keys walk the flattened group order and click opens work items / agents', async () => {
    render(<CommandPalette open onClose={vi.fn()} />);
    await screen.findByTestId('command-palette-item-agent.a1');
    type('daily');
    expect(selectedId()).toBe('command-palette-item-workItem.scheduled.j1');
    type('i');
    const order = Array.from(document.querySelectorAll('[role="option"]')).map(
      (n) => (n as HTMLElement).dataset.testid
    );
    key('ArrowDown');
    expect(selectedId()).toBe(order[1]);
    key('ArrowUp');
    key('ArrowUp');
    expect(selectedId()).toBe(order[0]);

    fireEvent.click(screen.getByTestId('command-palette-item-workItem.task.t1'));
    expect(mocks.navigate).toHaveBeenLastCalledWith('/tasks?task=t1');
    fireEvent.click(screen.getByTestId('command-palette-item-agent.a1'));
    expect(mocks.navigate).toHaveBeenLastCalledWith('/agent-center/a1');
  });

  it('stays usable when a source fails or returns empty', async () => {
    mocks.conversations.mockRejectedValue(new Error('offline'));
    mocks.board.mockRejectedValue(new Error('no board'));
    mocks.cron.mockRejectedValue(new Error('no cron'));
    mocks.agents.mockResolvedValue([]);
    render(<CommandPalette open onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.agents).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByTestId(/command-palette-loading-/)).toBeNull());
    expect(groups()).toEqual(['navigation', 'agents', 'settings']);
    type('settings');
    expect(screen.getByTestId('command-palette-item-nav.settings')).toBeTruthy();
    type('zzz-nothing');
    expect(screen.getByTestId('command-palette-empty')).toBeTruthy();
  });

  it('shows a per-group loading row until the slow source resolves', async () => {
    const slow = deferred<ReturnType<typeof conversationsPage>>();
    mocks.conversations.mockReturnValue(slow.promise);
    render(<CommandPalette open onClose={vi.fn()} />);
    await screen.findByTestId('command-palette-item-agent.a1');
    expect(screen.getByTestId('command-palette-loading-sessions')).toBeTruthy();
    await act(async () => {
      slow.resolve(conversationsPage('Late chat'));
      await slow.promise;
    });
    expect(screen.queryByTestId('command-palette-loading-sessions')).toBeNull();
    expect(screen.getByTestId('command-palette-item-session.c0')).toBeTruthy();
  });

  it('caps each dynamic group so the palette stays compact', async () => {
    mocks.conversations.mockResolvedValue(conversationsPage(...Array.from({ length: 30 }, (_, i) => `Chat ${i}`)));
    render(<CommandPalette open onClose={vi.fn()} />);
    await screen.findByTestId('command-palette-item-session.c0');
    const sessionRows = () =>
      within(screen.getByTestId('command-palette-group-sessions')).getAllByRole('option').length;
    expect(sessionRows()).toBe(5);
    type('chat');
    expect(sessionRows()).toBe(8);
  });

  it('reuses cached results within the TTL and refetches after it', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const { rerender } = render(<CommandPalette open onClose={vi.fn()} />);
    await screen.findByTestId('command-palette-item-session.c0');
    expect(mocks.conversations).toHaveBeenCalledTimes(1);

    rerender(<CommandPalette open={false} onClose={vi.fn()} />);
    rerender(<CommandPalette open onClose={vi.fn()} />);
    expect(screen.getByTestId('command-palette-item-session.c0')).toBeTruthy();
    expect(mocks.conversations).toHaveBeenCalledTimes(1);

    rerender(<CommandPalette open={false} onClose={vi.fn()} />);
    now.mockReturnValue(1_000_000 + PALETTE_DYNAMIC_TTL_MS + 1);
    rerender(<CommandPalette open onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.conversations).toHaveBeenCalledTimes(2));
  });
});
