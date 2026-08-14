import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import type { JournalTranscript } from '@/common/types/journalTranscript';
import {
  mergeDbWithJournalTranscript,
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

  it('uses reconstructible content and keeps user prompts on the right', () => {
    const messages = messagesFromJournalTranscript('conv-1', {
      ...transcript,
      model_visible_count: 1,
      items: [
        {
          sequence: 1,
          event_id: 'evt-user',
          journal_kind: 'UserPrompt',
          transcript_kind: 'user/message',
          visibility: 'model',
          summary: 'please list…',
          content: 'please list files in the workspace',
          source_sequences: [1],
        },
      ],
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: 'text',
      position: 'right',
      content: { content: 'please list files in the workspace' },
    });
  });
});

describe('mergeDbWithJournalTranscript', () => {
  it('keeps DB user bubbles when the journal only recovered assistant rows', () => {
    const db = [
      {
        id: 'u1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'hi' },
      },
    ] as TMessage[];
    const recovered = messagesFromJournalTranscript('conv-1', transcript);
    const merged = mergeDbWithJournalTranscript(db, recovered);
    expect(merged[0]).toMatchObject({ id: 'u1', position: 'right' });
    expect(merged).toHaveLength(3);
  });

  it('lets the journal replace the DB projection when it includes the user prompt', () => {
    const db = [
      {
        id: 'u1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'stale user row' },
      },
    ] as TMessage[];
    const recovered = messagesFromJournalTranscript('conv-1', {
      ...transcript,
      items: [
        {
          sequence: 1,
          event_id: 'evt-user',
          journal_kind: 'UserPrompt',
          transcript_kind: 'user/message',
          visibility: 'model',
          summary: 'please list files',
          source_sequences: [1],
        },
        transcript.items[0],
      ],
    });
    const merged = mergeDbWithJournalTranscript(db, recovered);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      position: 'right',
      content: { content: 'please list files' },
    });
    expect(merged.some((message) => message.id === 'u1')).toBe(false);
  });

  it('returns the DB list when the journal recovered nothing', () => {
    const db = [
      {
        id: 'u1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'hi' },
      },
    ] as TMessage[];
    expect(mergeDbWithJournalTranscript(db, [])).toBe(db);
  });
});
