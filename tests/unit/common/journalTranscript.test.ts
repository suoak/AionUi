import { describe, expect, it } from 'vitest';
import {
  buildJournalTranscriptPath,
  createEmptyJournalTranscript,
  normalizeJournalTranscript,
  transcriptItemText,
} from '@/common/types/journalTranscript';

describe('transcriptItemText', () => {
  it('prefers reconstructible content over the truncated summary', () => {
    expect(
      transcriptItemText({
        sequence: 1,
        event_id: 'evt-1',
        journal_kind: 'UserPrompt',
        transcript_kind: 'user/message',
        visibility: 'model',
        summary: 'please list…',
        content: 'please list files in the workspace',
        source_sequences: [1],
      })
    ).toBe('please list files in the workspace');
  });

  it('uses the summary when the host compacted an older tool result', () => {
    expect(
      transcriptItemText({
        sequence: 1,
        event_id: 'evt-tool',
        journal_kind: 'ToolCall',
        transcript_kind: 'tool/call',
        visibility: 'model',
        summary: 'full output 1',
        content: 'stale leftover payload that must not be shown',
        compacted: true,
        source_sequences: [1],
      })
    ).toBe('full output 1');
  });

  it('falls back to the summary when content is missing or blank', () => {
    expect(
      transcriptItemText({
        sequence: 1,
        event_id: 'evt-1',
        journal_kind: 'Text',
        transcript_kind: 'assistant/message',
        visibility: 'model',
        summary: 'hello from journal',
        content: '   ',
        source_sequences: [1],
      })
    ).toBe('hello from journal');
  });
});

describe('buildJournalTranscriptPath', () => {
  it('defaults to the host-visible projection', () => {
    expect(buildJournalTranscriptPath('conv-1')).toBe('/api/conversations/conv-1/transcript?visibility=host');
  });

  it('requests the model-visible deriveMessages equivalent', () => {
    expect(buildJournalTranscriptPath('conv-1', 'model')).toBe('/api/conversations/conv-1/transcript?visibility=model');
  });
});

describe('normalizeJournalTranscript', () => {
  it('fills Core fields that older AionCore builds omit', () => {
    const transcript = normalizeJournalTranscript({ schema_version: 1 }, 'conv-1');
    expect(transcript).toMatchObject({
      schema_version: 1,
      conversation_id: 'conv-1',
      visibility: 'host',
      items: [],
      compaction_lock: 'none',
      tool_pairing_balanced: false,
      model_surface_reconstructible: true,
      approval_policy: 'ask',
      compaction_keep_n: 3,
      tokens: { log_revision: 0, surface_tokens: 0, nodes: [] },
    });
  });

  it('keeps an empty conversation id from falling back to a blank string', () => {
    expect(createEmptyJournalTranscript('conv-empty').conversation_id).toBe('conv-empty');
    expect(normalizeJournalTranscript(null, 'conv-empty').conversation_id).toBe('conv-empty');
    expect(normalizeJournalTranscript(undefined, 'conv-empty').conversation_id).toBe('conv-empty');
  });

  it('treats unknown visibility and malformed collections as host-safe defaults', () => {
    const transcript = normalizeJournalTranscript(
      {
        conversation_id: 'conv-1',
        visibility: 'all',
        items: [{ event_id: 'evt-1', visibility: 'secret', source_sequences: ['bad', 3] }, 'skip-me'],
        tokens: { log_revision: 4, surface_tokens: 12, nodes: [{ sequence: 3, tokens: 8 }, null] },
        compaction_lock: '',
        tool_pairing_balanced: 'yes',
      } as never,
      'fallback'
    );

    expect(transcript.visibility).toBe('host');
    expect(transcript.compaction_lock).toBe('none');
    expect(transcript.tool_pairing_balanced).toBe(false);
    expect(transcript.model_surface_reconstructible).toBe(true);
    expect(transcript.items).toEqual([
      {
        sequence: 0,
        event_id: 'evt-1',
        journal_kind: '',
        transcript_kind: 'host/notice',
        visibility: 'host',
        summary: '',
        content: undefined,
        compacted: false,
        source_sequences: [3],
      },
    ]);
    expect(transcript.tokens).toEqual({
      log_revision: 4,
      surface_tokens: 12,
      nodes: [{ sequence: 3, tokens: 8 }],
    });
  });

  it('preserves a complete host transcript from current AionCore', () => {
    const transcript = normalizeJournalTranscript(
      {
        schema_version: 3,
        conversation_id: 'conv-1',
        visibility: 'host',
        model_visible_count: 1,
        model_visible_sha256: 'aa',
        journal_sha256: 'bb',
        compaction_lock: 'open',
        tool_pairing_balanced: true,
        tokens: { log_revision: 9, surface_tokens: 40, nodes: [{ sequence: 2, tokens: 40 }] },
        items: [
          {
            sequence: 2,
            event_id: 'evt-text',
            journal_kind: 'Text',
            transcript_kind: 'assistant/message',
            visibility: 'model',
            summary: 'hello',
            content: 'hello world',
            compacted: false,
            source_sequences: [1, 2],
          },
        ],
      },
      'fallback'
    );

    expect(transcript.compaction_lock).toBe('open');
    expect(transcript.tool_pairing_balanced).toBe(true);
    expect(transcript.model_surface_reconstructible).toBe(true);
    expect(transcript.items[0]).toMatchObject({
      visibility: 'model',
      content: 'hello world',
      source_sequences: [1, 2],
    });
  });

  it('keeps an explicit not-reconstructible flag from current AionCore', () => {
    expect(
      normalizeJournalTranscript({ conversation_id: 'conv-1', model_surface_reconstructible: false }, 'conv-1')
        .model_surface_reconstructible
    ).toBe(false);
  });

  it('keeps never-approval and a valid keep-N from current AionCore', () => {
    const transcript = normalizeJournalTranscript(
      { conversation_id: 'conv-1', approval_policy: 'never', compaction_keep_n: 10 },
      'conv-1'
    );
    expect(transcript.approval_policy).toBe('never');
    expect(transcript.compaction_keep_n).toBe(10);
  });

  it('falls back when keep-N is out of range', () => {
    expect(normalizeJournalTranscript({ compaction_keep_n: 99 }, 'conv-1').compaction_keep_n).toBe(3);
  });
});
