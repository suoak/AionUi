import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckSpecV1, PresentationCatalog } from '@/common/types/office/presentation';
import type { ReviewThread } from '@/common/types/agent/taskSession';
import { projectFileRef } from '@/common/types/chatFile';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  resolve: vi.fn(),
  reopen: vi.fn(),
  addComment: vi.fn(),
  remove: vi.fn(),
  sendBatch: vi.fn(),
  catalog: vi.fn(),
  addToSendBox: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    presentation: {
      catalog: { invoke: mocks.catalog },
      cancel: { invoke: vi.fn() },
      render: { invoke: vi.fn() },
      job: { invoke: vi.fn() },
      validate: { invoke: vi.fn() },
      importAsset: { invoke: vi.fn() },
    },
    dialog: { showOpen: { invoke: vi.fn() } },
    review: {
      list: { invoke: mocks.list },
      create: { invoke: mocks.create },
      update: { invoke: vi.fn() },
      resolve: { invoke: mocks.resolve },
      reopen: { invoke: mocks.reopen },
      addComment: { invoke: mocks.addComment },
      remove: { invoke: mocks.remove },
      sendBatch: { invoke: mocks.sendBatch },
    },
  },
}));
vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({ addToSendBox: mocks.addToSendBox }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; count?: number; number?: number }) =>
      options?.defaultValue ?? (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}));
vi.mock('@/renderer/components/Markdown', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import PresentationStudio from '@/renderer/pages/conversation/Preview/components/PresentationStudio';
import { serializeDeckSpec } from '@/renderer/pages/conversation/Preview/components/PresentationStudio/deckState';

const catalog: PresentationCatalog = {
  version: '1',
  hash: 'h',
  themes: [
    {
      id: 'business-light',
      label: 'Business Light',
      tokens: { background: 'ffffff', surface: 'f5f5f5', accent: '3366ff', text: '111111' },
    },
  ],
  layouts: [
    { id: 'cover', role: 'cover', label: 'Cover', slots: [], controls: [] },
    { id: 'closing', role: 'closing', label: 'Closing', slots: [], controls: [] },
  ],
};

const deck = (): DeckSpecV1 => ({
  schemaVersion: 1,
  revision: 4,
  stage: 'ready',
  metadata: { title: 'Quarterly review', language: 'en-US', aspectRatio: '16:9' },
  theme: { id: 'business-light' },
  slides: [
    {
      id: 'cover',
      role: 'cover',
      title: 'Q1',
      layoutId: 'cover',
      blocks: [{ id: 'title', type: 'text', slot: 'title', text: 'Q1' }],
    },
    {
      id: 'close',
      role: 'closing',
      title: 'Thanks',
      layoutId: 'closing',
      blocks: [{ id: 'thanks', type: 'chart', slot: 'title', text: 'Revenue' }],
    },
  ],
  assets: [],
});

const thread = (over: Partial<ReviewThread> = {}): ReviewThread => ({
  id: 't-close',
  scope_kind: 'task_run',
  scope_id: 'office:c1',
  file_path: 'decks/q1.workmate-deck.json',
  side: 'new',
  start_line: 2,
  end_line: 2,
  status: 'open',
  moved_fuzzy: false,
  anchor: { v: 1, before: [], lines: ['Slide 2 · chart'], after: [], hunk_header: 'Slide 2 · chart · Revenue' },
  comments: [
    { id: 'c1', thread_id: 't-close', author: 'user', body: 'fix closing chart', created_at: 1, updated_at: 1 },
  ],
  created_at: 1,
  updated_at: 1,
  ...over,
});

const renderStudio = (content = serializeDeckSpec(deck())) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <PresentationStudio
        content={content}
        fileRef={projectFileRef('pe1', 'decks/q1.workmate-deck.json')}
        fileName='q1.workmate-deck.json'
        workspace='/ws'
        onChange={vi.fn()}
        onSave={async () => true}
        onReload={async () => true}
      />
    </SWRConfig>
  );

beforeEach(() => {
  window.location.hash = '#/conversation/c1';
  mocks.catalog.mockResolvedValue(catalog);
  mocks.list.mockResolvedValue([thread()]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PresentationStudio review annotations', () => {
  it('shows an unresolved badge on the target slide, opens the drawer, and jumps to the thread slide', async () => {
    renderStudio();
    await waitFor(() => expect(screen.getByTestId('slide-review-count-close')).toBeInTheDocument());
    expect(screen.getByTestId('slide-review-count-close').textContent).toBe('1');
    expect(screen.queryByTestId('slide-review-count-cover')).toBeNull();

    fireEvent.click(await screen.findByTestId('office-review-toggle'));
    expect(await screen.findByTestId('office-review-drawer')).toBeInTheDocument();
    expect(screen.getByText('fix closing chart')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('office-review-thread-target'));
    await waitFor(() => {
      const closeSlide = screen.getByTestId('slide-review-count-close').closest('div');
      expect(closeSlide?.className).toContain('border-primary');
    });
  });
});
