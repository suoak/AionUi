import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewThread } from '@/common/types/agent/taskSession';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  sendBatch: vi.fn(),
  capabilities: vi.fn(),
  generating: new Set<string>(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return { ...actual, Message: { ...actual.Message, success: mocks.success, error: mocks.error } };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    review: { list: { invoke: mocks.list }, sendBatch: { invoke: mocks.sendBatch } },
    conversation: { getCapabilities: { invoke: mocks.capabilities } },
  },
}));
vi.mock('@/renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContextSafe: () => ({
    conversations: [
      { id: 'c-page', name: 'Page conversation' },
      { id: 'c-run', name: 'Run conversation' },
    ],
    isConversationGenerating: (id: string) => mocks.generating.has(id),
  }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}));

import SendReviewMenu from '@/renderer/pages/conversation/Preview/components/annotate/SendReviewMenu';
import type { ReviewScope } from '@/renderer/pages/conversation/Preview/components/annotate';

const SCOPE: ReviewScope = { scope_kind: 'scm', scope_id: 'pe:pe1', file_path: 'src/a.ts' };

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
  anchor: { v: 1, before: [], lines: [], after: [] },
  comments: [{ id: 'c1', thread_id: 't1', author: 'user', body: 'note one', created_at: 1, updated_at: 1 }],
  created_at: 1,
  updated_at: 1,
  ...over,
});

const renderMenu = (scope: ReviewScope = SCOPE, onClose = vi.fn()) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SendReviewMenu visible scope={scope} onClose={onClose} />
    </SWRConfig>
  );

const steerRadio = () =>
  screen.getByTestId('review-send-steer').querySelector('input[type="radio"]') as HTMLInputElement;

beforeEach(() => {
  window.location.hash = '#/conversation/c-page';
  mocks.generating.clear();
  mocks.list.mockResolvedValue([
    thread({}),
    thread({ id: 't2', file_path: 'src/b.ts', status: 'sent' }),
    thread({ id: 't3', status: 'resolved' }),
  ]);
  mocks.capabilities.mockResolvedValue({ steer: true, inject: false });
  mocks.sendBatch.mockResolvedValue({ batch: { id: 'b1' }, input_receipt: {} });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SendReviewMenu', () => {
  it('lists every unresolved note of the scope and sends them as a followup to the open conversation', async () => {
    const onClose = vi.fn();
    renderMenu(SCOPE, onClose);
    await waitFor(() => expect(screen.getAllByTestId('review-send-note')).toHaveLength(2));
    expect(mocks.list).toHaveBeenCalledWith({ scope_kind: 'scm', scope_id: 'pe:pe1' });
    expect(screen.getAllByText('Page conversation').length).toBeGreaterThan(0);
    // Idle conversation: no steer.
    await waitFor(() => expect(mocks.capabilities).toHaveBeenCalledWith({ conversation_id: 'c-page' }));
    expect(steerRadio().disabled).toBe(true);

    fireEvent.click(screen.getByText('preview.annotate.send.confirm {"count":2}'));
    await waitFor(() => expect(mocks.sendBatch).toHaveBeenCalled());
    expect(mocks.sendBatch).toHaveBeenCalledWith({
      target_conversation_id: 'c-page',
      delivery: 'followup',
      thread_ids: ['t1', 't2'],
      scope_kind: 'scm',
      scope_id: 'pe:pe1',
      preface: undefined,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.success).toHaveBeenCalledWith('preview.annotate.send.sent {"count":2}');
  });

  it('targets the conversation that made the change and allows steer while it runs', async () => {
    mocks.generating.add('c-run');
    renderMenu({ ...SCOPE, scope_kind: 'task_run', conversation_id: 'c-run' });
    await waitFor(() => expect(mocks.capabilities).toHaveBeenCalledWith({ conversation_id: 'c-run' }));
    await waitFor(() => expect(steerRadio().disabled).toBe(false));
    fireEvent.click(steerRadio());
    await waitFor(() => expect(screen.getAllByTestId('review-send-note')).toHaveLength(2));
    fireEvent.click(screen.getByText('preview.annotate.send.confirm {"count":2}'));
    await waitFor(() =>
      expect(mocks.sendBatch).toHaveBeenCalledWith(
        expect.objectContaining({ target_conversation_id: 'c-run', delivery: 'steer' })
      )
    );
  });
});
