/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M8 E8 Batch — wire / storage types aligned with aioncore #197 (E8-1, migration 076).
 *
 * IMPORTANT
 * - Core #197 is **data layer only** (no HTTP yet). These types mirror `BatchJobRow` /
 *   `BatchItemRow` plus provisional HTTP enrichments marked below.
 * - Product decisions **D8-1..D8-8 are NOT enforced** here (no trial gate, no mode=agent-only
 *   lock, no concurrency/timeout caps). UI must not invent those behaviors until Core HTTP
 *   lands and D8 is decided.
 * - Proposed HTTP paths live in store `m8-s6-ui.md` / `m8-s5-ui.md` §2; do not call them
 *   until E8-4 is on Core main.
 */

/** Job lifecycle statuses — matches CHECK on `batch_jobs.status`. */
export type BatchJobStatus =
  | 'draft'
  | 'trial'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Item lifecycle statuses — matches CHECK on `batch_items.status`. */
export type BatchItemStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'timeout'
  | 'skipped'
  | 'cancelled';

export const BATCH_JOB_STATUSES: readonly BatchJobStatus[] = [
  'draft',
  'trial',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
] as const;

export const BATCH_ITEM_STATUSES: readonly BatchItemStatus[] = [
  'pending',
  'running',
  'passed',
  'failed',
  'timeout',
  'skipped',
  'cancelled',
] as const;

/**
 * Storage-shaped job (aioncore `BatchJobRow`).
 * `template` / `checks` remain JSON strings at the DB boundary.
 */
export type BatchJobRow = {
  id: string;
  user_id: string;
  title: string;
  project_id: string | null;
  /** Prompt template JSON string (may contain `{{target}}` placeholders). */
  template: string;
  agent_type: string | null;
  assistant_id: string | null;
  /** Session mode string; product may later restrict to "agent" (D8-3, undecided). */
  mode: string;
  /** No UI/server caps until D8-4. */
  concurrency: number;
  item_timeout_sec: number;
  /** Opaque JSON array string until E8-2 checkers. */
  checks: string;
  status: BatchJobStatus;
  /** Stored only; trial gate is D8-2 (undecided) — do not enforce in UI yet. */
  trial_size: number;
  created_at: number;
  updated_at: number;
};

/**
 * Storage-shaped item (aioncore `BatchItemRow`).
 * `target` / `check_results` remain JSON (strings) at the DB boundary.
 */
export type BatchItemRow = {
  id: string;
  batch_job_id: string;
  seq: number;
  /** Target JSON string, e.g. `{"repo":"…","path":"…"}`. */
  target: string;
  task_session_id: string | null;
  attempt: number;
  status: BatchItemStatus;
  /** Opaque JSON array string until E8-2. */
  check_results: string | null;
  error: string | null;
  started_at: number | null;
  finished_at: number | null;
};

// ---------------------------------------------------------------------------
// Provisional HTTP enrichments (E8-4). Not present on #197 rows.
// Keep optional so stubs compile before Core HTTP exists.
// ---------------------------------------------------------------------------

/** Check specs (design E8 §2.1). Validators land in Core E8-2 (D8-6). */
export type BatchCheck =
  | { kind: 'file_exists'; path: string }
  | { kind: 'glob'; pattern: string; min?: number; max?: number }
  | { kind: 'json_schema'; path: string; schema: unknown };

export type BatchCheckResult = {
  index: number;
  kind: BatchCheck['kind'];
  passed: boolean;
  message?: string;
};

export type BatchStatusCounts = {
  pending: number;
  running: number;
  passed: number;
  failed: number;
  timeout: number;
  skipped: number;
  cancelled: number;
};

/**
 * Future `GET/POST /api/batch*` payload shape (provisional).
 * Prefer parsed JSON for template/checks/target once HTTP exists.
 */
export type BatchJob = Omit<BatchJobRow, 'template' | 'checks'> & {
  template: Record<string, unknown> | string;
  checks: BatchCheck[] | string;
  counts?: BatchStatusCounts;
  /** Only when D8-2 trial confirmation lands on Core. */
  trial_confirmed_at?: number | null;
};

export type BatchItem = Omit<BatchItemRow, 'target' | 'check_results'> & {
  target: Record<string, unknown> | string;
  check_results: BatchCheckResult[] | string | null;
  /** Conversation jump target once Runner wires sessions. */
  conversation_id?: string | null;
  /** Prior sessions kept after retry (acceptance 3). */
  previous_task_session_ids?: string[];
};

/** Narrow a string to a known job status (no throw). */
export function asBatchJobStatus(value: string): BatchJobStatus | null {
  return (BATCH_JOB_STATUSES as readonly string[]).includes(value) ? (value as BatchJobStatus) : null;
}

/** Narrow a string to a known item status (no throw). */
export function asBatchItemStatus(value: string): BatchItemStatus | null {
  return (BATCH_ITEM_STATUSES as readonly string[]).includes(value) ? (value as BatchItemStatus) : null;
}
