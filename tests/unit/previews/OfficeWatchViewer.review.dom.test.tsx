import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewThread } from '@/common/types/agent/taskSession';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  statusOn: vi.fn(() => () => undefined),
  list: vi.fn(),
  create: vi.fn(),
  resolve: vi.fn(),
  reopen: vi.fn(),
  addComment: vi.fn(),
  remove: vi.fn(),
  sendBatch: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    pptPreview: {
      start: { invoke: mocks.start },
      stop: { invoke: mocks.stop },
      status: { on: mocks.statusOn },
    },
    wordPreview: {
      start: { invoke: mocks.start },
      stop: { invoke: mocks.stop },
      status: { on: mocks.statusOn },
    },
    excelPreview: {
      start: { invoke: mocks.start },
      stop: { invoke: mocks.stop },
      status: { on: mocks.statusOn },
    },
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
const tStable = vi.hoisted(() => {
  const t = (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key);
  return { t };
});
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: tStable.t }),
}));
vi.mock('@/renderer/components/Markdown', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/renderer/components/media/WebviewHost', () => ({
  default: ({ url }: { url: string }) => <div data-testid='office-webview' data-url={url} />,
}));

import OfficeWatchViewer from '@/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer';

const thread = (over: Partial<ReviewThread> = {}): ReviewThread => ({
  id: 't1',
  scope_kind: 'task_run',
  scope_id: 'office:c1',
  file_path: 'deck.pptx',
  side: 'new',
  start_line: 2,
  end_line: 2,
  status: 'open',
  moved_fuzzy: false,
  anchor: { v: 1, before: [], lines: ['Slide 2'], after: [], hunk_header: 'Slide 2' },
  comments: [{ id: 'c1', thread_id: 't1', author: 'user', body: 'note', created_at: 1, updated_at: 1 }],
  created_at: 1,
  updated_at: 1,
  ...over,
});

describe('OfficeWatchViewer review drawer', () => {
  let electronApiStub: unknown;

  beforeEach(() => {
    const w = window as Window & { electronAPI?: unknown };
    electronApiStub = w.electronAPI;
    delete w.electronAPI;
    window.location.hash = '#/conversation/c1';
    mocks.start.mockResolvedValue({ url: '/api/ppt-proxy/59324' });
    mocks.stop.mockResolvedValue(undefined);
    mocks.list.mockResolvedValue([thread()]);
  });

  afterEach(() => {
    (window as Window & { electronAPI?: unknown }).electronAPI = electronApiStub;
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps the iframe mounted when the review drawer is toggled open and closed', async () => {
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <div style={{ height: 400 }}>
          <OfficeWatchViewer docType='ppt' file_path='/ws/deck.pptx' workspace='/ws' file_name='deck.pptx' />
        </div>
      </SWRConfig>
    );

    const iframe = await waitFor(() => {
      const node = document.querySelector('iframe');
      expect(node).not.toBeNull();
      return node as HTMLIFrameElement;
    });
    const src = iframe.src || iframe.getAttribute('src');
    expect(src).toContain('/api/ppt-proxy/59324');

    fireEvent.click(await screen.findByTestId('office-review-toggle'));
    expect(await screen.findByTestId('office-review-drawer')).toBeInTheDocument();
    const iframeAfterOpen = document.querySelector('iframe') as HTMLIFrameElement;
    expect(iframeAfterOpen).toBe(iframe);
    expect(screen.getByTestId('office-watch-surface').contains(iframeAfterOpen)).toBe(true);

    fireEvent.click(screen.getByTestId('office-review-close'));
    await waitFor(() => expect(screen.queryByTestId('office-review-drawer')).toBeNull());
    expect(document.querySelector('iframe')).toBe(iframe);
  });
});
