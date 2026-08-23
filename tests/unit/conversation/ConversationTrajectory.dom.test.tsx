/** @vitest-environment jsdom */

import type { JournalTranscript, TrajectoryProjection } from '@/common/types/journalTranscript';
import ConversationTrajectoryButton from '@/renderer/pages/conversation/components/Trajectory';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTrajectory = vi.fn();
const getRawTrajectory = vi.fn();
const getTrajectoryRecord = vi.fn();
const getRetainedOutput = vi.fn();
const getJournalTranscript = vi.fn();
const getCapabilities = vi.fn();
const setHostPolicy = vi.fn();
let trajectoryChangedListener:
  | ((event: { conversation_id: string; last_sequence: number; log_revision: number }) => void)
  | undefined;

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      getTrajectory: { invoke: (...args: unknown[]) => getTrajectory(...args) },
      getRawTrajectory: { invoke: (...args: unknown[]) => getRawTrajectory(...args) },
      getTrajectoryRecord: { invoke: (...args: unknown[]) => getTrajectoryRecord(...args) },
      getRetainedOutput: { invoke: (...args: unknown[]) => getRetainedOutput(...args) },
      getJournalTranscript: { invoke: (...args: unknown[]) => getJournalTranscript(...args) },
      getCapabilities: { invoke: (...args: unknown[]) => getCapabilities(...args) },
      setHostPolicy: { invoke: (...args: unknown[]) => setHostPolicy(...args) },
      trajectoryChanged: {
        on: vi.fn(
          (listener: (event: { conversation_id: string; last_sequence: number; log_revision: number }) => void) => {
            trajectoryChangedListener = listener;
            return vi.fn();
          }
        ),
      },
    },
  },
}));

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data,
    itemContent,
  }: {
    data: unknown[];
    itemContent: (index: number, item: unknown) => React.ReactNode;
  }) => (
    <div>
      {data.slice(0, 20).map((item, index) => (
        <React.Fragment key={index}>{itemContent(index, item)}</React.Fragment>
      ))}
    </div>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => (options?.count === undefined ? key : `${key}:${options.count}`),
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

const transcript: JournalTranscript = {
  schema_version: 3,
  conversation_id: 'conv-1',
  visibility: 'host',
  items: [],
  model_visible_count: 0,
  model_visible_sha256: 'aa',
  journal_sha256: 'bb',
  compaction_lock: 'none',
  tokens: { log_revision: 3, surface_tokens: 18, nodes: [] },
  tool_pairing_balanced: true,
  model_surface_reconstructible: true,
  approval_policy: 'ask',
  compaction_keep_n: 3,
};

const projection: TrajectoryProjection = {
  schema_version: 1,
  conversation_id: 'conv-1',
  records: [
    {
      record_id: 'input:1',
      category: 'input',
      status: 'applied',
      visibility: 'host',
      turn_id: 'turn-1',
      step_id: 'turn-1:step:1',
      title: 'InputApplied',
      summary: 'hello',
      input_preview: 'hello',
      tokens: {},
      first_sequence: 1,
      last_sequence: 3,
      source_sequences: [1, 2, 3],
    },
  ],
  overview: {
    turns: 1,
    steps: 1,
    tools: 0,
    errors: 0,
    tokens: { input: 12, output: 8, cached: 1_234, thinking: 56 },
  },
  has_more: false,
  oldest_sequence: 1,
  newest_sequence: 3,
  log_revision: 3,
};

describe('ConversationTrajectoryButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trajectoryChangedListener = undefined;
    getTrajectory.mockResolvedValue(projection);
    getRawTrajectory.mockResolvedValue({
      schema_version: 1,
      conversation_id: 'conv-1',
      events: [{ event_id: 'raw-1', sequence: 1, timestamp_ms: 10, kind: 'LegacyNoise', payload: {} }],
      has_more: false,
      oldest_sequence: 1,
      newest_sequence: 1,
      log_revision: 1,
    });
    getJournalTranscript.mockResolvedValue(transcript);
    getCapabilities.mockResolvedValue(null);
    getTrajectoryRecord.mockResolvedValue(projection.records[0]);
    getRetainedOutput.mockResolvedValue({
      reference: 'output:abc',
      sha256: 'cc',
      size: 20,
      content: 'complete retained output',
    });
    setHostPolicy.mockResolvedValue({ approval: 'never', compaction_keep_n: 3 });
  });

  it('loads trajectory only after the user opens the view', async () => {
    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    expect(getTrajectory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));
    expect(await screen.findByTestId('conversation-trajectory-view')).toBeInTheDocument();
    await waitFor(() => expect(getTrajectory).toHaveBeenCalledWith({ conversation_id: 'conv-1', limit: 100 }));
  });

  it('renders folded semantic records and overview values', async () => {
    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));
    expect(await screen.findByText('hello')).toBeInTheDocument();
    expect(screen.getAllByTestId('conversation-trajectory-item')).toHaveLength(1);
    expect(screen.getByTestId('conversation-trajectory-overview')).toHaveTextContent(
      'conversation.trajectory.overview.turns'
    );
    expect(screen.getByTestId('conversation-trajectory-overview')).toHaveTextContent(
      'conversation.trajectory.overview.cachedTokens'
    );
    await waitFor(() => expect(screen.getByTestId('conversation-trajectory-overview')).toHaveTextContent('1,234'));
    expect(screen.getByTestId('conversation-trajectory-overview')).toHaveTextContent(
      'conversation.trajectory.overview.thinkingTokens'
    );
  });

  it('shows structured tool diagnostics as explicit inspector fields', async () => {
    getTrajectoryRecord.mockResolvedValueOnce({
      ...projection.records[0],
      category: 'tool',
      status: 'failed',
      error_code: 'execution_failed',
      truncation: { original_bytes: 20, output_bytes: 10, limit_bytes: 10 },
      retained_output_reference: 'output:abc',
      structured_content: { rows: 2 },
      detail: { provider: 'aionrs' },
    });
    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));
    fireEvent.click(await screen.findByTestId('conversation-trajectory-item'));

    expect(await screen.findByText('execution_failed')).toBeInTheDocument();
    expect(screen.getByText('output:abc')).toBeInTheDocument();
    expect(screen.getByText(/"rows": 2/)).toBeInTheDocument();
    expect(screen.getByText(/"original_bytes": 20/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('conversation-trajectory-load-retained-output'));
    expect(await screen.findByText('complete retained output')).toBeInTheDocument();
    expect(getRetainedOutput).toHaveBeenCalledWith({ conversation_id: 'conv-1', reference: 'output:abc' });
  });

  it('replaces list previews with complete content after detail loads', async () => {
    const fullOutput = `preview ${'detail '.repeat(80)}`;
    getTrajectory.mockResolvedValueOnce({
      ...projection,
      records: [{ ...projection.records[0], category: 'tool', output_preview: 'preview...' }],
    });
    getTrajectoryRecord.mockResolvedValueOnce({
      ...projection.records[0],
      category: 'tool',
      output_preview: fullOutput,
      detail: { output: fullOutput },
    });
    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));
    fireEvent.click(await screen.findByTestId('conversation-trajectory-item'));

    await waitFor(() =>
      expect(screen.getByTestId('conversation-trajectory-inspector')).toHaveTextContent(fullOutput.trim())
    );
  });

  it('stacks the timeline and inspector on narrow screens while retaining desktop columns', async () => {
    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));
    const view = await screen.findByTestId('conversation-trajectory-view');
    await screen.findByTestId('conversation-trajectory-item');

    const layout = view.querySelector('[class*="grid-rows-"]');
    expect(layout).toHaveClass('grid-cols-1', 'md:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]');
    expect(layout).toHaveClass('grid-rows-[minmax(0,3fr)_minmax(220px,2fr)]', 'md:grid-rows-1');
  });

  it('collapses nested tool executions as one subtree', async () => {
    getTrajectory.mockResolvedValue({
      ...projection,
      records: [
        {
          ...projection.records[0],
          record_id: 'tool:parent',
          category: 'tool',
          title: 'Parent tool',
          summary: 'parent output',
        },
        {
          ...projection.records[0],
          record_id: 'tool:child',
          parent_record_id: 'tool:parent',
          category: 'tool',
          title: 'Child tool',
          summary: 'child output',
        },
      ],
    });
    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));
    expect(await screen.findByText('child output')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('conversation-trajectory-tree-toggle'));
    expect(screen.queryByText('child output')).not.toBeInTheDocument();
    expect(screen.getByText('parent output')).toBeInTheDocument();
  });

  it('keeps the mounted record count bounded for more than 1656 trajectory records', async () => {
    getTrajectory.mockResolvedValue({
      ...projection,
      records: Array.from({ length: 1700 }, (_, index) => ({
        ...projection.records[0],
        record_id: `tool:${index}`,
        category: 'tool',
        title: `Tool ${index}`,
        summary: `Output ${index}`,
        first_sequence: index + 1,
        last_sequence: index + 1,
        source_sequences: [index + 1],
      })),
      newest_sequence: 1700,
      log_revision: 1700,
    });

    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));

    await screen.findByText('Output 0');
    expect(screen.getAllByTestId('conversation-trajectory-item')).toHaveLength(20);
    expect(screen.queryByText('Output 1699')).not.toBeInTheDocument();
  });

  it('keeps noisy events behind the explicit raw switch', async () => {
    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));
    await screen.findByText('hello');
    fireEvent.change(screen.getByPlaceholderText('conversation.trajectory.searchPlaceholder'), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(getRawTrajectory).toHaveBeenCalledWith({ conversation_id: 'conv-1', limit: 100 }));
    expect((await screen.findAllByText(/LegacyNoise/)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('switch'));
    expect(await screen.findByText('hello')).toBeInTheDocument();
  });

  it('ignores a stale detail response after switching to raw mode', async () => {
    let resolveDetail: ((value: (typeof projection.records)[number]) => void) | undefined;
    getTrajectoryRecord.mockImplementationOnce(
      () =>
        new Promise<(typeof projection.records)[number]>((resolve) => {
          resolveDetail = resolve;
        })
    );
    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));
    fireEvent.click(await screen.findByTestId('conversation-trajectory-item'));
    await waitFor(() => expect(getTrajectoryRecord).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('switch'));
    expect((await screen.findAllByText(/LegacyNoise/)).length).toBeGreaterThan(0);
    await act(async () => {
      resolveDetail?.({
        ...projection.records[0],
        title: 'Stale semantic detail',
        detail: { output: 'must not overwrite raw selection' },
      });
      await Promise.resolve();
    });

    expect(screen.queryByText('Stale semantic detail')).not.toBeInTheDocument();
  });

  it('continues incremental loading when a newer journal notification arrives during a request', async () => {
    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));
    await screen.findByText('hello');
    await waitFor(() => expect(trajectoryChangedListener).toBeDefined());

    let resolveFirstIncremental: ((value: TrajectoryProjection) => void) | undefined;
    getTrajectory
      .mockImplementationOnce(
        () =>
          new Promise<TrajectoryProjection>((resolve) => {
            resolveFirstIncremental = resolve;
          })
      )
      .mockResolvedValueOnce({
        ...projection,
        records: [],
        newest_sequence: undefined,
        log_revision: 5,
      });

    trajectoryChangedListener?.({ conversation_id: 'conv-1', last_sequence: 4, log_revision: 4 });
    await waitFor(() =>
      expect(getTrajectory).toHaveBeenLastCalledWith({ conversation_id: 'conv-1', after_sequence: 3, limit: 100 })
    );
    trajectoryChangedListener?.({ conversation_id: 'conv-1', last_sequence: 5, log_revision: 5 });
    resolveFirstIncremental?.({
      ...projection,
      records: [],
      newest_sequence: undefined,
      log_revision: 4,
    });

    await waitFor(() =>
      expect(getTrajectory).toHaveBeenLastCalledWith({ conversation_id: 'conv-1', after_sequence: 4, limit: 100 })
    );
    expect(getTrajectory).toHaveBeenCalledTimes(3);
  });

  it('updates an existing tool record in place when its terminal status arrives', async () => {
    const running = {
      ...projection,
      records: [
        {
          ...projection.records[0],
          record_id: 'tool:call-1',
          category: 'tool',
          status: 'running',
          title: 'Search',
        },
      ],
    };
    getTrajectory.mockResolvedValueOnce(running);
    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));
    expect(await screen.findByText('conversation.trajectory.status.running')).toBeInTheDocument();
    await waitFor(() => expect(trajectoryChangedListener).toBeDefined());

    getTrajectory.mockResolvedValueOnce({
      ...running,
      records: [{ ...running.records[0], status: 'completed', last_sequence: 4, source_sequences: [1, 4] }],
      newest_sequence: 4,
      log_revision: 4,
    });
    trajectoryChangedListener?.({ conversation_id: 'conv-1', last_sequence: 4, log_revision: 4 });

    await waitFor(() => expect(screen.queryByText('conversation.trajectory.status.running')).not.toBeInTheDocument());
    expect(screen.getAllByTestId('conversation-trajectory-item')).toHaveLength(1);
  });

  it('retries after the trajectory endpoint fails', async () => {
    getTrajectory.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(projection);
    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));
    expect(await screen.findByText('conversation.trajectory.loadFailed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('common.retry'));
    await waitFor(() => expect(getTrajectory).toHaveBeenCalledTimes(2));
  });

  it('closes stale trajectory state when conversation changes', async () => {
    let resolveFirst: ((value: TrajectoryProjection) => void) | undefined;
    getTrajectory.mockImplementationOnce(
      () =>
        new Promise<TrajectoryProjection>((resolve) => {
          resolveFirst = resolve;
        })
    );
    const { rerender } = render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));
    await waitFor(() => expect(getTrajectory).toHaveBeenCalledTimes(1));
    rerender(<ConversationTrajectoryButton conversationId='conv-2' />);
    resolveFirst?.(projection);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
