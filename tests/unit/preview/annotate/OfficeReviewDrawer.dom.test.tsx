import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewThread } from '@/common/types/agent/taskSession';
import type { ReviewScope } from '@/renderer/pages/conversation/Preview/components/annotate';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  resolve: vi.fn(),
  reopen: vi.fn(),
  addComment: vi.fn(),
  remove: vi.fn(),
  sendBatch: vi.fn(),
  capabilities: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    review: {
      list: { invoke: mocks.list },
      create: { invoke: mocks.create },
      update: { invoke: mocks.update },
      resolve: { invoke: mocks.resolve },
      reopen: { invoke: mocks.reopen },
      addComment: { invoke: mocks.addComment },
      remove: { invoke: mocks.remove },
      sendBatch: { invoke: mocks.sendBatch },
    },
    conversation: { getCapabilities: { invoke: mocks.capabilities } },
  },
}));
vi.mock('@/renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContextSafe: () => ({
    conversations: [{ id: 'c-page', name: 'Page conversation' }],
    isConversationGenerating: () => false,
  }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}));
vi.mock('@/renderer/components/Markdown', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import OfficeReviewDrawer from '@/renderer/pages/conversation/Preview/components/annotate/OfficeReviewDrawer';

const SCOPE: ReviewScope = {
  scope_kind: 'task_run',
  scope_id: 'office:c-page',
  file_path: 'decks/q1.pptx',
  conversation_id: 'c-page',
};

const thread = (over: Partial<ReviewThread> = {}): ReviewThread => ({
  id: 't1',
  scope_kind: 'task_run',
  scope_id: 'office:c-page',
  file_path: 'decks/q1.pptx',
  side: 'new',
  start_line: 3,
  end_line: 3,
  status: 'open',
  moved_fuzzy: false,
  anchor: { v: 1, before: [], lines: ['Slide 3 · Chart'], after: [], hunk_header: 'Slide 3 · Chart' },
  comments: [{ id: 'c1', thread_id: 't1', author: 'user', body: 'fix the chart', created_at: 1, updated_at: 1 }],
  created_at: 1,
  updated_at: 1,
  ...over,
});

const renderDrawer = (props: Partial<React.ComponentProps<typeof OfficeReviewDrawer>> = {}) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <OfficeReviewDrawer
        scope={SCOPE}
        docType='presentation'
        open
        onClose={vi.fn()}
        lockedTarget={{ unitNumber: 3, unitLabel: 'Slide', elementLabel: 'Chart', snippet: 'Q1 chart' }}
        {...props}
      />
    </SWRConfig>
  );

beforeEach(() => {
  window.location.hash = '#/conversation/c-page';
  mocks.list.mockResolvedValue([]);
  mocks.capabilities.mockResolvedValue({ steer: false });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OfficeReviewDrawer', () => {
  it('hides itself when the review API is not ready', async () => {
    mocks.list.mockImplementation(() => new Promise(() => undefined));
    renderDrawer();
    expect(screen.queryByTestId('office-review-drawer')).toBeNull();
  });

  it('creates an annotation on the locked slide target', async () => {
    mocks.create.mockImplementation(async (input: Record<string, unknown>) =>
      thread({
        id: 'new',
        comments: [
          { id: 'c2', thread_id: 'new', author: 'user', body: String(input.body), created_at: 2, updated_at: 2 },
        ],
      })
    );
    renderDrawer();
    await waitFor(() => expect(screen.getByTestId('office-review-drawer')).toBeInTheDocument());
    expect(screen.getByTestId('office-review-target-badge').textContent).toContain('Slide 3');
    const composer = screen.getByRole('textbox');
    fireEvent.change(composer, { target: { value: 'please enlarge the chart' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scope_kind: 'task_run',
        scope_id: 'office:c-page',
        file_path: 'decks/q1.pptx',
        side: 'new',
        start_line: 3,
        end_line: 3,
        body: 'please enlarge the chart',
        diff_context: expect.objectContaining({
          base: 'office-artifact',
          hunk_header: 'Slide 3 · Chart',
          lines: ['Q1 chart'],
        }),
      })
    );
  });

  it('resolves and reopens a thread, and notifies the host when a target is clicked', async () => {
    const onSelectThread = vi.fn();
    const openThread = thread();
    mocks.list.mockResolvedValue([openThread]);
    mocks.resolve.mockResolvedValue({ ...openThread, status: 'resolved' });
    mocks.reopen.mockResolvedValue(openThread);
    renderDrawer({ onSelectThread });
    await waitFor(() => expect(screen.getByText('fix the chart')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('office-review-thread-target'));
    expect(onSelectThread).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', start_line: 3 }));
    fireEvent.click(screen.getByText('preview.annotate.resolve'));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith({ id: 't1' }));
    fireEvent.click(screen.getByText('preview.annotate.reopen'));
    await waitFor(() => expect(mocks.reopen).toHaveBeenCalledWith({ id: 't1' }));
  });

  it('disables send when there are no unresolved notes and opens SendReviewMenu otherwise', async () => {
    mocks.list.mockResolvedValue([thread()]);
    mocks.sendBatch.mockResolvedValue({
      batch: {
        id: 'b1',
        target_conversation_id: 'c-page',
        delivery: 'followup',
        thread_ids: ['t1'],
        content: '',
        input_id: null,
        status: 'accepted',
        error_message: null,
        created_at: 1,
      },
    });
    renderDrawer();
    const send = await screen.findByTestId('office-review-send');
    expect((send as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(send);
    expect(await screen.findByTestId('review-send-menu')).toBeInTheDocument();
  });

  it('lets the user pick a page and element in interactive mode', async () => {
    mocks.create.mockImplementation(async (input: Record<string, unknown>) =>
      thread({ id: 'new', ...input } as Partial<ReviewThread>)
    );
    renderDrawer({
      docType: 'word',
      lockedTarget: undefined,
      interactiveTarget: true,
    });
    await waitFor(() => expect(screen.getByTestId('office-review-interactive-target')).toBeInTheDocument());
    const unit = screen.getByTestId('office-review-unit').querySelector('input') as HTMLInputElement;
    expect(unit).toBeTruthy();
    fireEvent.change(unit, { target: { value: '2' } });
    const element = screen.getByTestId('office-review-element').querySelector('input') as HTMLInputElement;
    fireEvent.change(element, { target: { value: 'Heading' } });
    const comment = document.querySelector('[data-review-composer] textarea') as HTMLTextAreaElement;
    fireEvent.change(comment, { target: { value: 'tighten this heading' } });
    fireEvent.keyDown(comment, { key: 'Enter' });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        start_line: 2,
        end_line: 2,
        body: 'tighten this heading',
        diff_context: expect.objectContaining({
          hunk_header: expect.stringMatching(/2/),
          lines: expect.any(Array),
        }),
      })
    );
    const lines = (mocks.create.mock.calls[0][0] as { diff_context: { lines: string[] } }).diff_context.lines;
    expect(lines).toHaveLength(1);
  });
});
