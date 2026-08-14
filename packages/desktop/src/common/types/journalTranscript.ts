/**
 * Host transcript projected from AionCore's canonical event journal.
 *
 * This is WorkMate's consume path for the DeepSeek Harness `deriveMessages()`
 * idea: model-visible conversation content must be reconstructible from the
 * journal, not only from the live DB projection.
 */

export type JournalTranscriptVisibility = 'model' | 'host';

export type JournalTranscriptItem = {
  sequence: number;
  event_id: string;
  journal_kind: string;
  transcript_kind: string;
  visibility: 'model' | 'host';
  summary: string;
  source_sequences: number[];
};

export type JournalTranscript = {
  schema_version: number;
  conversation_id: string;
  visibility: JournalTranscriptVisibility;
  items: JournalTranscriptItem[];
  model_visible_count: number;
  model_visible_sha256: string;
  journal_sha256: string;
};

export function buildJournalTranscriptPath(
  conversationId: string,
  visibility: JournalTranscriptVisibility = 'host'
): string {
  const params = new URLSearchParams({ visibility });
  return `/api/conversations/${conversationId}/transcript?${params.toString()}`;
}
