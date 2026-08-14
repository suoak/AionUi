import { describe, expect, it } from 'vitest';
import { buildJournalTranscriptPath, transcriptItemText } from '@/common/types/journalTranscript';

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
