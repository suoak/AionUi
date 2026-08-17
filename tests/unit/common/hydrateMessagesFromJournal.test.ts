import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import type { JournalTranscript } from '@/common/types/journalTranscript';
import {
  isJournalMessageAlreadyShown,
  isLiveJournalUserClone,
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
  compaction_lock: 'none',
  tokens: { log_revision: 0, surface_tokens: 0, nodes: [] },
  tool_pairing_balanced: true,
  model_surface_reconstructible: true,
  approval_policy: 'ask',
  compaction_keep_n: 3,
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

  it('keeps the DB user identity when the journal reconstructs the same prompt', () => {
    const db = [
      {
        id: 'u1',
        msg_id: 'u1',
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
      id: 'u1',
      msg_id: 'u1',
      position: 'right',
      content: { content: 'please list files' },
    });
  });

  it('keeps journal user rows when the DB has no user bubble yet', () => {
    const recovered = messagesFromJournalTranscript('conv-1', {
      ...transcript,
      items: [
        {
          sequence: 1,
          event_id: 'evt-user',
          journal_kind: 'UserPrompt',
          transcript_kind: 'user/message',
          visibility: 'model',
          summary: 'hello',
          source_sequences: [1],
        },
      ],
    });
    const merged = mergeDbWithJournalTranscript([], recovered);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: 'journal:evt-user',
      position: 'right',
    });
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

  it('fills a missing tool call when the DB already has assistant text', () => {
    const db = [
      {
        id: 'u1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'hi' },
      },
      {
        id: 'a1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        content: { content: 'hello from journal' },
      },
    ] as TMessage[];
    const merged = mergeDbWithJournalTranscript(db, messagesFromJournalTranscript('conv-1', transcript));
    expect(merged).toHaveLength(3);
    expect(merged[1]).toMatchObject({ id: 'a1', content: { content: 'hello from journal' } });
    expect(merged[2]).toMatchObject({ type: 'tool_call', content: { call_id: 'evt-tool' } });
  });

  it('keeps host-only DB rows out of the journal backbone', () => {
    const db = [
      {
        id: 'u1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'hi' },
      },
      {
        id: 'think-1',
        conversation_id: 'conv-1',
        type: 'thinking',
        position: 'left',
        content: { content: 'planning' },
      },
    ] as TMessage[];
    const merged = mergeDbWithJournalTranscript(db, messagesFromJournalTranscript('conv-1', transcript));
    expect(merged.map((message) => message.id)).toEqual(['u1', 'think-1', 'journal:evt-text', 'journal:evt-tool']);
  });

  it('does not overwrite an unfinished live assistant with the journal row', () => {
    const db = [
      {
        id: 'a1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        status: 'pending',
        content: { content: 'hel' },
      },
    ] as TMessage[];
    const merged = mergeDbWithJournalTranscript(db, messagesFromJournalTranscript('conv-1', transcript));
    expect(merged[0]).toMatchObject({ id: 'a1', status: 'pending', content: { content: 'hel' } });
    expect(merged.some((message) => message.type === 'tool_call')).toBe(true);
  });
});

describe('isJournalMessageAlreadyShown', () => {
  it('matches a reconstructed assistant against persisted text', () => {
    const existing = [
      {
        id: 'a1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        content: { content: 'hello from journal' },
      },
    ] as TMessage[];
    const recovered = messagesFromJournalTranscript('conv-1', transcript);
    expect(isJournalMessageAlreadyShown(existing, recovered[0])).toBe(true);
    expect(isJournalMessageAlreadyShown(existing, recovered[1])).toBe(false);
  });
});

describe('isLiveJournalUserClone', () => {
  const liveUser = {
    id: 'u1',
    msg_id: 'u1',
    conversation_id: 'conv-1',
    type: 'text',
    position: 'right',
    content: { content: '你好' },
  } as TMessage;
  const journalUser = {
    id: 'journal:evt-user',
    msg_id: 'evt-user',
    conversation_id: 'conv-1',
    type: 'text',
    position: 'right',
    content: { content: '你好' },
  } as TMessage;

  it('matches a live user bubble with its journal reconstruction', () => {
    expect(isLiveJournalUserClone(liveUser, journalUser)).toBe(true);
  });

  it('does not collapse two real user turns with the same text', () => {
    expect(
      isLiveJournalUserClone(liveUser, {
        ...liveUser,
        id: 'u2',
        msg_id: 'u2',
      })
    ).toBe(false);
  });
});
