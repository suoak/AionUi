import { describe, expect, it } from 'vitest';
import { buildJournalTranscriptPath } from '@/common/types/journalTranscript';

describe('buildJournalTranscriptPath', () => {
  it('defaults to the host-visible projection', () => {
    expect(buildJournalTranscriptPath('conv-1')).toBe(
      '/api/conversations/conv-1/transcript?visibility=host'
    );
  });

  it('requests the model-visible deriveMessages equivalent', () => {
    expect(buildJournalTranscriptPath('conv-1', 'model')).toBe(
      '/api/conversations/conv-1/transcript?visibility=model'
    );
  });
});
