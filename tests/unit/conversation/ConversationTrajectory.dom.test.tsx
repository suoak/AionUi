/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JournalTranscript } from '@/common/types/journalTranscript';
import ConversationTrajectoryButton from '@/renderer/pages/conversation/components/Trajectory';

const getJournalTranscript = vi.fn();
const setHostPolicy = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      getJournalTranscript: {
        invoke: (...args: unknown[]) => getJournalTranscript(...args),
      },
      setHostPolicy: {
        invoke: (...args: unknown[]) => setHostPolicy(...args),
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => (options?.count === undefined ? key : `${key}:${options.count}`),
  }),
}));

const hostTranscript: JournalTranscript = {
  schema_version: 3,
  conversation_id: 'conv-1',
  visibility: 'host',
  model_visible_count: 1,
  model_visible_sha256: 'aa',
  journal_sha256: 'bb',
  compaction_lock: 'none',
  tool_pairing_balanced: true,
  model_surface_reconstructible: true,
  approval_policy: 'ask',
  compaction_keep_n: 3,
  tokens: { log_revision: 2, surface_tokens: 18, nodes: [{ sequence: 2, tokens: 18 }] },
  items: [
    {
      sequence: 1,
      event_id: 'evt-start',
      journal_kind: 'Start',
      transcript_kind: 'turn/start',
      visibility: 'host',
      summary: 'turn started',
      source_sequences: [1],
    },
    {
      sequence: 2,
      event_id: 'evt-user',
      journal_kind: 'UserPrompt',
      transcript_kind: 'user/message',
      visibility: 'model',
      summary: '你好',
      content: '你好',
      source_sequences: [2],
    },
  ],
};

describe('ConversationTrajectoryButton', () => {
  beforeEach(() => {
    getJournalTranscript.mockReset();
    setHostPolicy.mockReset();
    getJournalTranscript.mockResolvedValue(hostTranscript);
    setHostPolicy.mockResolvedValue({ approval: 'never', compaction_keep_n: 1 });
  });

  it('does not fetch the host transcript until the drawer is opened', () => {
    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    expect(getJournalTranscript).not.toHaveBeenCalled();
    expect(screen.queryByTestId('conversation-trajectory-drawer')).not.toBeInTheDocument();
  });

  it('loads the host-visible journal when the header button is clicked', async () => {
    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));

    await waitFor(() => {
      expect(getJournalTranscript).toHaveBeenCalledWith({
        conversation_id: 'conv-1',
        visibility: 'host',
      });
    });

    expect(await screen.findByTestId('conversation-trajectory-drawer')).toBeInTheDocument();
    expect(screen.getByText('conversation.trajectory.itemCount:2')).toBeInTheDocument();
    expect(screen.getByText('conversation.trajectory.surfaceTokens:18')).toBeInTheDocument();
    expect(screen.getAllByTestId('conversation-trajectory-item')).toHaveLength(2);
    expect(screen.getByText('你好')).toBeInTheDocument();
  });

  it('warns when the model-visible surface is not reconstructible', async () => {
    getJournalTranscript.mockResolvedValue({
      ...hostTranscript,
      model_surface_reconstructible: false,
    });

    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));

    expect(await screen.findByTestId('conversation-trajectory-not-reconstructible')).toBeInTheDocument();
    expect(screen.getByText('conversation.trajectory.notReconstructible')).toBeInTheDocument();
  });

  it('writes host policy when the approval radio changes', async () => {
    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));
    expect(await screen.findByTestId('conversation-trajectory-policy')).toBeInTheDocument();

    fireEvent.click(screen.getByText('conversation.trajectory.policy.approvalNever'));

    await waitFor(() => {
      expect(setHostPolicy).toHaveBeenCalledWith({
        conversation_id: 'conv-1',
        approval: 'never',
      });
    });
  });

  it('shows an empty host transcript without inventing events', async () => {
    getJournalTranscript.mockResolvedValue({
      ...hostTranscript,
      items: [],
      model_visible_count: 0,
      tokens: { log_revision: 0, surface_tokens: 0, nodes: [] },
    });

    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));

    expect(await screen.findByText('conversation.trajectory.empty')).toBeInTheDocument();
    expect(screen.queryByTestId('conversation-trajectory-item')).not.toBeInTheDocument();
  });

  it('retries after the journal endpoint fails', async () => {
    getJournalTranscript.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(hostTranscript);

    render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));

    expect(await screen.findByText('conversation.trajectory.loadFailed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('common.retry'));

    await waitFor(() => {
      expect(getJournalTranscript).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('你好')).toBeInTheDocument();
  });

  it('drops a stale in-flight transcript when the conversation changes', async () => {
    let resolveFirst: ((value: JournalTranscript) => void) | undefined;
    getJournalTranscript.mockImplementationOnce(
      () =>
        new Promise<JournalTranscript>((resolve) => {
          resolveFirst = resolve;
        })
    );

    const { rerender } = render(<ConversationTrajectoryButton conversationId='conv-1' />);
    fireEvent.click(screen.getByTestId('conversation-trajectory-button'));

    await waitFor(() => {
      expect(getJournalTranscript).toHaveBeenCalledTimes(1);
    });

    rerender(<ConversationTrajectoryButton conversationId='conv-2' />);
    resolveFirst?.(hostTranscript);

    await waitFor(() => {
      expect(screen.queryByTestId('conversation-trajectory-drawer')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('你好')).not.toBeInTheDocument();
  });
});
