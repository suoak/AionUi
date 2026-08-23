/**
 * Host transcript projected from AionCore's canonical event journal.
 *
 * Model-visible conversation content must be reconstructible from the journal,
 * not only from the live DB projection.
 */

export type JournalTranscriptVisibility = 'model' | 'host';

export type JournalTranscriptItem = {
  sequence: number;
  event_id: string;
  journal_kind: string;
  transcript_kind: string;
  visibility: 'model' | 'host';
  summary: string;
  /** Reconstructible model-visible payload. Absent on older AionCore builds. */
  content?: string;
  /** True when an older tool result was collapsed to its summary. */
  compacted?: boolean;
  source_sequences: number[];
};

export type JournalTranscriptTokens = {
  log_revision: number;
  surface_tokens: number;
  nodes: Array<{ sequence: number; tokens: number }>;
};

export type JournalCompactionLock = 'none' | 'open' | 'closed' | string;

export type JournalApprovalPolicy = 'ask' | 'never';

export const DEFAULT_COMPACTION_KEEP_N = 3;
export const MIN_COMPACTION_KEEP_N = 1;
export const MAX_COMPACTION_KEEP_N = 20;
export const COMPACTION_KEEP_N_OPTIONS = [1, 3, 5, 10] as const;

export type ConversationHostPolicy = {
  approval: JournalApprovalPolicy;
  compaction_keep_n: number;
};

export function normalizeApprovalPolicy(value: unknown): JournalApprovalPolicy {
  return value === 'never' ? 'never' : 'ask';
}

export function normalizeCompactionKeepN(value: unknown): number {
  const keepN = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : DEFAULT_COMPACTION_KEEP_N;
  if (keepN < MIN_COMPACTION_KEEP_N || keepN > MAX_COMPACTION_KEEP_N) {
    return DEFAULT_COMPACTION_KEEP_N;
  }
  return keepN;
}

export function transcriptItemText(item: JournalTranscriptItem): string {
  if (item.compacted) {
    return item.summary;
  }
  return item.content?.trim() ? item.content : item.summary;
}

export type JournalTranscript = {
  schema_version: number;
  conversation_id: string;
  visibility: JournalTranscriptVisibility;
  items: JournalTranscriptItem[];
  model_visible_count: number;
  model_visible_sha256: string;
  journal_sha256: string;
  /** `none` / `open` / `closed`. Absent on older AionCore builds. */
  compaction_lock: JournalCompactionLock;
  tokens: JournalTranscriptTokens;
  /** False when a tool call is still open. Absent on older AionCore builds. */
  tool_pairing_balanced: boolean;
  /**
   * False when a model-visible user/ask event has no reconstructible payload.
   * Absent on older AionCore builds — treat as true so we do not false-alarm.
   */
  model_surface_reconstructible: boolean;
  /** `ask` / `never`. Absent on older AionCore builds. */
  approval_policy: JournalApprovalPolicy;
  /** How many recent tool results stay uncompacted. Absent on older builds. */
  compaction_keep_n: number;
};

const emptyTokens = (): JournalTranscriptTokens => ({
  log_revision: 0,
  surface_tokens: 0,
  nodes: [],
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeTranscriptItem(item: unknown): JournalTranscriptItem {
  const raw = asRecord(item) ?? {};
  return {
    sequence: asFiniteNumber(raw.sequence),
    event_id: asString(raw.event_id),
    journal_kind: asString(raw.journal_kind),
    transcript_kind: asString(raw.transcript_kind, 'host/notice'),
    visibility: raw.visibility === 'model' ? 'model' : 'host',
    summary: asString(raw.summary),
    content: typeof raw.content === 'string' ? raw.content : undefined,
    compacted: raw.compacted === true,
    source_sequences: Array.isArray(raw.source_sequences)
      ? raw.source_sequences.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      : [],
  };
}

function normalizeTranscriptTokens(tokens: unknown): JournalTranscriptTokens {
  const raw = asRecord(tokens);
  const nodes = Array.isArray(raw?.nodes) ? raw.nodes : [];
  return {
    log_revision: asFiniteNumber(raw?.log_revision),
    surface_tokens: asFiniteNumber(raw?.surface_tokens),
    nodes: nodes.flatMap((node) => {
      const entry = asRecord(node);
      if (!entry) {
        return [];
      }
      return [{ sequence: asFiniteNumber(entry.sequence), tokens: asFiniteNumber(entry.tokens) }];
    }),
  };
}

/** Fill fields older AionCore builds omit so the UI can treat one shape. */
export function normalizeJournalTranscript(
  raw: Partial<JournalTranscript> | null | undefined,
  conversationId: string
): JournalTranscript {
  const record = asRecord(raw);
  const visibility = record?.visibility === 'model' ? 'model' : 'host';
  return {
    schema_version: asFiniteNumber(record?.schema_version),
    conversation_id: asString(record?.conversation_id, conversationId) || conversationId,
    visibility,
    items: Array.isArray(record?.items)
      ? record.items.flatMap((item) => (asRecord(item) ? [normalizeTranscriptItem(item)] : []))
      : [],
    model_visible_count: asFiniteNumber(record?.model_visible_count),
    model_visible_sha256: asString(record?.model_visible_sha256),
    journal_sha256: asString(record?.journal_sha256),
    compaction_lock: asString(record?.compaction_lock, 'none') || 'none',
    tokens: normalizeTranscriptTokens(record?.tokens),
    tool_pairing_balanced: record?.tool_pairing_balanced === true,
    model_surface_reconstructible: record?.model_surface_reconstructible !== false,
    approval_policy: normalizeApprovalPolicy(record?.approval_policy),
    compaction_keep_n: normalizeCompactionKeepN(record?.compaction_keep_n),
  };
}

export function createEmptyJournalTranscript(conversationId: string): JournalTranscript {
  return normalizeJournalTranscript({ conversation_id: conversationId, tokens: emptyTokens() }, conversationId);
}

export function buildJournalTranscriptPath(
  conversationId: string,
  visibility: JournalTranscriptVisibility = 'host'
): string {
  const params = new URLSearchParams({ visibility });
  return `/api/conversations/${conversationId}/transcript?${params.toString()}`;
}

export type TrajectoryTokenUsage = {
  input?: number;
  output?: number;
  cached?: number;
  thinking?: number;
};

export type TrajectoryRecord = {
  record_id: string;
  category: string;
  status: string;
  visibility: string;
  turn_id?: string;
  step_id?: string;
  parent_record_id?: string;
  input_id?: string;
  execution_id?: string;
  tool_call_id?: string;
  started_at_ms?: number;
  completed_at_ms?: number;
  duration_ms?: number;
  title: string;
  summary: string;
  input_preview?: string;
  output_preview?: string;
  retained_output_reference?: string;
  structured_content?: unknown;
  error_code?: string;
  truncation?: unknown;
  tokens: TrajectoryTokenUsage;
  first_sequence: number;
  last_sequence: number;
  source_sequences: number[];
  detail?: unknown;
};

export type TrajectoryOverview = {
  turns: number;
  steps: number;
  tools: number;
  errors: number;
  total_duration_ms?: number;
  first_output_ms?: number;
  tokens: TrajectoryTokenUsage;
};

export type TrajectoryProjection = {
  schema_version: number;
  conversation_id: string;
  records: TrajectoryRecord[];
  overview: TrajectoryOverview;
  has_more: boolean;
  oldest_sequence?: number;
  newest_sequence?: number;
  next_before_sequence?: number;
  log_revision: number;
};

export type RawTrajectoryEvent = {
  event_id: string;
  sequence: number;
  timestamp_ms: number;
  kind: string;
  payload: unknown;
};

export type RawTrajectoryProjection = {
  schema_version: number;
  conversation_id: string;
  events: RawTrajectoryEvent[];
  has_more: boolean;
  oldest_sequence?: number;
  newest_sequence?: number;
  next_before_sequence?: number;
  log_revision: number;
};

export type ConversationTrajectoryChangedEvent = {
  conversation_id: string;
  last_sequence: number;
  log_revision: number;
};

export type TrajectoryPageParams = {
  conversation_id: string;
  before_sequence?: number;
  after_sequence?: number;
  limit?: number;
};

export function buildTrajectoryPath(params: TrajectoryPageParams, raw = false): string {
  const search = new URLSearchParams();
  if (params.before_sequence !== undefined) search.set('before_sequence', String(params.before_sequence));
  if (params.after_sequence !== undefined) search.set('after_sequence', String(params.after_sequence));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  const query = search.toString();
  return `/api/conversations/${params.conversation_id}/trajectory${raw ? '/raw' : ''}${query ? `?${query}` : ''}`;
}
