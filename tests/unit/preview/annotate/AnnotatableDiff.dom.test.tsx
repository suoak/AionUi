import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewThread } from '@/common/types/agent/taskSession';

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    review: {
      list: { invoke: mocks.list },
      create: { invoke: mocks.create },
      update: { invoke: vi.fn() },
      resolve: { invoke: vi.fn() },
      reopen: { invoke: vi.fn() },
      addComment: { invoke: vi.fn() },
      remove: { invoke: vi.fn() },
    },
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}));
vi.mock('@/renderer/components/Markdown', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { BackendHttpError } from '@/common/adapter/httpBridge';
import { AnnotatableDiff, type ReviewScope } from '@/renderer/pages/conversation/Preview/components/annotate';

const PATCH = [
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +1,4 @@',
  ' line1',
  '+line2',
  ' line3',
  ' line4',
  '@@ -10,2 +11,2 @@',
  ' l11',
  '-l12',
  '+L12',
  '',
].join('\n');

const SCOPE: ReviewScope = { scope_kind: 'scm', scope_id: 'pe:pe1', file_path: 'src/a.ts', base: 'WORKTREE' };

const thread = (over: Partial<ReviewThread>): ReviewThread => ({
  id: 't1',
  scope_kind: 'scm',
  scope_id: 'pe:pe1',
  file_path: 'src/a.ts',
  side: 'new',
  start_line: 2,
  end_line: 2,
  status: 'open',
  moved_fuzzy: false,
  anchor: { v: 1, before: [], lines: ['line2'], after: [] },
  comments: [{ id: 'c1', thread_id: 't1', author: 'user', body: 'why?', created_at: 1, updated_at: 1 }],
  created_at: 1,
  updated_at: 1,
  ...over,
});

const renderDiff = (scope: ReviewScope | null = SCOPE) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <AnnotatableDiff patch={PATCH} scope={scope ?? undefined} />
    </SWRConfig>
  );

const row = (newNumber: number) => document.querySelector(`[data-diff-new="${newNumber}"]`) as HTMLElement;
const addButton = (newNumber: number) => row(newNumber).querySelector('button') as HTMLElement;
const root = () => document.querySelector('[data-annotatable-diff]') as HTMLElement;

const ready = () => waitFor(() => expect(document.querySelector('[data-review-unresolved]')).not.toBeNull());

beforeEach(() => {
  mocks.list.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.documentElement.removeAttribute('data-theme');
});

describe('AnnotatableDiff', () => {
  it('renders old/new line numbers from the parsed diff', async () => {
    renderDiff();
    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    expect(mocks.list).toHaveBeenCalledWith({ scope_kind: 'scm', scope_id: 'pe:pe1', file_path: 'src/a.ts' });
    expect(row(2).dataset.diffOld).toBeUndefined();
    expect(row(3).dataset.diffOld).toBe('2');
    expect(document.querySelector('[data-diff-old="11"]:not([data-diff-new])')).not.toBeNull();
    expect(document.querySelectorAll('[data-diff-hunk]')).toHaveLength(2);
  });

  it('drag selection stops at the hunk edge and creates a thread with its diff context', async () => {
    mocks.create.mockImplementation(async (input: Record<string, unknown>) => thread({ id: 'new', ...input }));
    renderDiff();
    await ready();
    fireEvent.mouseDown(addButton(2));
    fireEvent.mouseEnter(row(4));
    fireEvent.mouseEnter(row(12)); // other hunk: ignored
    fireEvent.mouseUp(window);

    expect(document.querySelectorAll('[data-selected="true"]')).toHaveLength(3);
    const composer = await screen.findByRole('textbox');
    fireEvent.change(composer, { target: { value: 'rename this' } });
    fireEvent.keyDown(composer, { key: 'Enter' });

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith({
      scope_kind: 'scm',
      scope_id: 'pe:pe1',
      file_path: 'src/a.ts',
      side: 'new',
      start_line: 2,
      end_line: 4,
      body: 'rename this',
      diff_context: {
        hunk_header: '@@ -1,3 +1,4 @@',
        base: 'WORKTREE',
        before: ['line1'],
        lines: ['line2', 'line3', 'line4'],
        after: [],
      },
    });
    await waitFor(() => expect(document.querySelector('[data-review-composer]')).toBeNull());
  });

  it('Esc in the composer cancels the selection without saving', async () => {
    renderDiff();
    await ready();
    fireEvent.mouseDown(addButton(3));
    fireEvent.mouseUp(window);
    const composer = await screen.findByRole('textbox');
    fireEvent.change(composer, { target: { value: 'draft' } });
    fireEvent.keyDown(composer, { key: 'Escape' });
    expect(document.querySelector('[data-review-composer]')).toBeNull();
    expect(document.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('C annotates the hovered line and Esc on the diff cancels', async () => {
    renderDiff();
    await ready();
    fireEvent.mouseEnter(row(1));
    fireEvent.keyDown(root(), { key: 'c' });
    expect(await screen.findByRole('textbox')).toBeTruthy();
    expect(row(1).dataset.selected).toBe('true');
    fireEvent.keyDown(root(), { key: 'Escape' });
    expect(document.querySelector('[data-review-composer]')).toBeNull();
  });

  it('shows the unresolved count, pins threads and lists detached ones', async () => {
    mocks.list.mockResolvedValue([
      thread({ id: 'a' }),
      thread({ id: 'b', status: 'resolved' }),
      thread({ id: 'c', status: 'outdated', comments: [] }),
    ]);
    renderDiff();
    await waitFor(() =>
      expect(document.querySelector('[data-review-unresolved]')?.getAttribute('data-review-unresolved')).toBe('2')
    );
    expect(document.querySelectorAll('[data-review-thread]')).toHaveLength(3);
    expect(document.querySelector('[data-review-detached] [data-review-thread]')).not.toBeNull();
  });

  it('degrades to a plain read-only diff on a Core without the review API', async () => {
    mocks.list.mockRejectedValue(
      new BackendHttpError({
        method: 'GET',
        path: '/api/review-threads',
        status: 404,
        body: { success: false, code: 'NOT_FOUND', error: 'Route not found.' },
      })
    );
    renderDiff();
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    // Let SWR settle: no retry, no error notice, no annotation entry.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-review-unresolved]')).toBeNull();
    expect(screen.queryByText('preview.annotate.loadFailed')).toBeNull();
    expect(row(2).querySelector('button')).toBeNull();
    fireEvent.mouseEnter(row(2));
    fireEvent.keyDown(root(), { key: 'c' });
    expect(document.querySelector('[data-review-composer]')).toBeNull();
    // The diff itself still renders.
    expect(row(3).dataset.diffOld).toBe('2');
  });

  it('follows the dark theme and is read-only without a scope', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    renderDiff(null);
    expect(document.querySelector('.d2h-dark-color-scheme')).not.toBeNull();
    expect(row(2).querySelector('button')).toBeNull();
    expect(document.querySelector('[data-review-unresolved]')).toBeNull();
    expect(mocks.list).not.toHaveBeenCalled();

    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await waitFor(() => expect(document.querySelector('.d2h-dark-color-scheme')).toBeNull());
  });
});
