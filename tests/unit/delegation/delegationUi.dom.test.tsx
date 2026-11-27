/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Delegation } from '@/common/types/delegation';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/common', () => ({ ipcBridge: { delegation: { list: { invoke: mocks.list } } } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

import AtFileMenu from '@/renderer/components/chat/AtFileMenu';
import DelegationStrip from '@/renderer/components/chat/DelegationStrip';
import { DELEGATION_POLL_MS, useConversationDelegations } from '@/renderer/hooks/chat/useConversationDelegations';

const d = (id: string, overrides: Partial<Delegation> = {}): Delegation => ({
  id,
  parent_conversation_id: 'p',
  child_conversation_id: `child-${id}`,
  assistant_id: 'writer',
  task_text: `task ${id}`,
  status: 'running',
  created_at: Number(id.replace(/\D/g, '')) || 1,
  updated_at: 1,
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('AtFileMenu assistants group', () => {
  it('lists assistants above files on one shared index', () => {
    const onSelectAssistant = vi.fn();
    render(
      <AtFileMenu
        activeIndex={1}
        emptyText='none'
        items={[{ name: 'a.ts', path: '/w/a.ts', relativePath: 'a.ts', isFile: true } as never]}
        label='mentions'
        loading={false}
        loadingText='…'
        onHoverItem={vi.fn()}
        onSelectItem={vi.fn()}
        assistants={[{ id: 'writer', name: 'Writer' }]}
        assistantsLabel='Assistants'
        filesLabel='Files'
        onSelectAssistant={onSelectAssistant}
      />
    );
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['@Writer', 'a.tsa.ts']);
    expect(options[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.mouseDown(screen.getByTestId('at-menu-assistant-writer'));
    expect(onSelectAssistant).toHaveBeenCalledWith({ id: 'writer', name: 'Writer' });
  });

  it('shows no group headers without assistants (files-only menu unchanged)', () => {
    render(
      <AtFileMenu
        activeIndex={0}
        emptyText='none'
        items={[]}
        label='mentions'
        loading={false}
        loadingText='…'
        onHoverItem={vi.fn()}
        onSelectItem={vi.fn()}
        filesLabel='Files'
      />
    );
    expect(screen.queryByText('Files')).toBeNull();
    expect(screen.queryByTestId('at-menu-assistants')).toBeNull();
  });
});

describe('DelegationStrip', () => {
  it('renders newest first with status and opens the child conversation', () => {
    render(
      <MemoryRouter initialEntries={['/conversation/p']}>
        <Routes>
          <Route
            path='/conversation/p'
            element={
              <DelegationStrip
                items={[d('d1', { status: 'completed' }), d('d2', { status: 'failed', error: 'denied' })]}
                assistantName={(id) => (id === 'writer' ? 'Writer' : id)}
              />
            }
          />
          <Route path='/conversation/child-d1' element={<div data-testid='child-page' />} />
        </Routes>
      </MemoryRouter>
    );
    const rows = screen.getAllByTestId(/^delegation-row-/);
    expect(rows.map((r) => r.getAttribute('data-status'))).toEqual(['failed', 'completed']);
    expect(rows[0].textContent).toContain('@Writer');
    expect(rows[0].textContent).toContain('denied');
    fireEvent.click(screen.getByTestId('delegation-open-d1'));
    expect(screen.getByTestId('child-page')).toBeTruthy();
  });

  it('renders nothing without delegations and no link outside a router', () => {
    const { container, rerender } = render(<DelegationStrip items={[]} />);
    expect(container.innerHTML).toBe('');
    rerender(<DelegationStrip items={[d('d1')]} />);
    expect(screen.queryByTestId('delegation-open-d1')).toBeNull();
  });
});

describe('useConversationDelegations', () => {
  beforeEach(() => vi.useFakeTimers());

  it('polls while a delegation runs and stops once all settle', async () => {
    mocks.list.mockResolvedValueOnce([d('d1')]).mockResolvedValue([d('d1', { status: 'completed' })]);
    const { result } = renderHook(() => useConversationDelegations('p', false));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.items[0]?.status).toBe('running');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELEGATION_POLL_MS);
    });
    expect(result.current.items[0]?.status).toBe('completed');
    const calls = mocks.list.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELEGATION_POLL_MS * 3);
    });
    expect(mocks.list.mock.calls.length).toBe(calls);
  });

  it('stops asking an older Core that answers 404', async () => {
    mocks.list.mockRejectedValue(Object.assign(new Error('nf'), { status: 404 }));
    renderHook(() => useConversationDelegations('p', true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELEGATION_POLL_MS * 3);
    });
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });
});
