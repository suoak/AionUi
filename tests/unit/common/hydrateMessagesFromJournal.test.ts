import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import type { JournalTranscript } from '@/common/types/journalTranscript';
import {
  messagesFromJournalTranscript,
  messagesNeedJournalHydration,
} from '@/renderer/utils/chat/hydrateMessagesFromJournal';

const transcript: JournalTranscript = {
  schema_version: 1,
  conversation_id: 'conv-1',
  visibility: 'model',
  model_visible_count: 2,
  model_visible_sha256: 'a'.repeat(64),
  journal_sha256: 'b'.repeat(64),
  items: [
    {
      sequence: 2,
      event_id: 'evt-text',
      journal_kind: 'Text',
      transcript_kind: 'assistant/message',
      visibility: 'model',
      summary: 'hello from journal',
      source_sequences: [2],
    },
    {
      sequence: 5,
      event_id: 'evt-tool',
      journal_kind: 'ToolCall',
      transcript_kind: 'tool/call',
      visibility: 'model',
      summary: 'Bash',
      source_sequences: [5],
    },
  ],
};

describe('messagesNeedJournalHydration', () => {
  it('is true when only user bubbles exist', () => {
    const messages = [
      {
        id: 'u1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'hi' },
      },
    ] as TMessage[];
    expect(messagesNeedJournalHydration(messages)).toBe(true);
  });

  it('is false when an assistant or tool row is already present', () => {
    const messages = [
      {
        id: 'a1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        content: { content: 'already persisted' },
      },
    ] as TMessage[];
    expect(messagesNeedJournalHydration(messages)).toBe(false);
  });
});

describe('messagesFromJournalTranscript', () => {
  it('rebuilds assistant text and tool calls from the model-visible journal', () => {
    const messages = messagesFromJournalTranscript('conv-1', transcript);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      type: 'text',
      position: 'left',
      content: { content: 'hello from journal' },
    });
    expect(messages[1]).toMatchObject({
      type: 'tool_call',
      content: { name: 'Bash', call_id: 'evt-tool' },
    });
  });
});
