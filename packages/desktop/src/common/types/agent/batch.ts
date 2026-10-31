/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M8 E8 Batch — wire types for Core `/api/batch*` (aioncore #203/#204/#205,
 * main cd4efb5c). Mirrors `aionui-api-types::batch` field by field; the
 * storage rows below are kept for reference only (the HTTP layer never
 * returns them).
 *
 * Accepted defaults enforced by Core (D8-2..D8-4): mandatory trial of
 * 1..=5 items (default 1), agent mode only, concurrency 1..=16 (default 4),
 * item timeout 60 s .. 4 h (default 30 min), at most 500 targets / 20 checks.
 */

/** Job lifecycle statuses — matches CHECK on `batch_jobs.status`. */
export type BatchJobStatus = 'draft' | 'trial' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/** Item lifecycle statuses — matches CHECK on `batch_items.status`. */
export type BatchItemStatus = 'pending' | 'running' | 'passed' | 'failed' | 'timeout' | 'skipped' | 'cancelled';

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
  /** Always `agent` (D8-3). */
  mode: string;
  /** 1..=16 (D8-4). */
  concurrency: number;
  item_timeout_sec: number;
  /** JSON array of `BatchCheck`. */
  checks: string;
  status: BatchJobStatus;
  /** Mandatory trial size, 1..=5 (D8-2). */
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
  /** JSON array of `BatchCheckResult`. */
  check_results: string | null;
  error: string | null;
  started_at: number | null;
  finished_at: number | null;
};

// ---------------------------------------------------------------------------
// HTTP wire types (Core E8-4, `aionui-api-types::batch`)
// ---------------------------------------------------------------------------

export const BATCH_MODE_AGENT = 'agent';
export const BATCH_DEFAULT_CONCURRENCY = 4;
export const BATCH_MAX_CONCURRENCY = 16;
export const BATCH_DEFAULT_ITEM_TIMEOUT_SEC = 30 * 60;
export const BATCH_MIN_ITEM_TIMEOUT_SEC = 60;
export const BATCH_MAX_ITEM_TIMEOUT_SEC = 4 * 60 * 60;
export const BATCH_DEFAULT_TRIAL_SIZE = 1;
export const BATCH_MAX_TRIAL_SIZE = 5;
export const BATCH_MAX_TARGETS = 500;
export const BATCH_MAX_CHECKS = 20;
/** Core `validate::MAX_TITLE_CHARS`. */
export const BATCH_MAX_TITLE_CHARS = 200;

/** WebSocket: a job's status or counts changed (refetch the job). */
export const EVENT_BATCH_JOB_UPDATED = 'batch.jobUpdated';
/** WebSocket: one item's status / check results changed. */
export const EVENT_BATCH_ITEM_UPDATED = 'batch.itemUpdated';

/** `error` Core writes on items that were running when the app restarted. */
export const BATCH_INTERRUPTED_ERROR = 'interrupted by an app restart';

/** Artifact check (`BatchCheckSpec`, tagged by `kind`). Paths are relative to the item workspace. */
export type BatchCheck =
  | { kind: 'file_exists'; path: string }
  | { kind: 'glob'; pattern: string; min?: number; max?: number }
  | { kind: 'json_schema'; path: string; schema: unknown };

export type BatchCheckKind = BatchCheck['kind'];

export const BATCH_CHECK_KINDS: readonly BatchCheckKind[] = ['file_exists', 'glob', 'json_schema'] as const;

/** One evaluated check on an item (`BatchCheckResult`). */
export type BatchCheckResult = {
  kind: string;
  ok: boolean;
  detail?: string;
};

/** Item counts by status (`BatchCounts`). */
export type BatchCounts = {
  total: number;
  pending: number;
  running: number;
  passed: number;
  failed: number;
  timeout: number;
  skipped: number;
  cancelled: number;
};

/** `GET /api/batch/{id}` and every job-returning action (`BatchJobResponse`). */
export type BatchJob = {
  id: string;
  title: string;
  project_id: string | null;
  /** `{ prompt }`; a raw string only if Core failed to parse what it stored. */
  template: { prompt: string } | string;
  agent_type: string | null;
  assistant_id: string | null;
  mode: string;
  concurrency: number;
  item_timeout_sec: number;
  checks: BatchCheck[] | string;
  status: BatchJobStatus | string;
  trial_size: number;
  counts: BatchCounts;
  /** Every trial item has finished (scale is allowed from `trial`). */
  trial_settled: boolean;
  created_at: number;
  updated_at: number;
};

/** `GET /api/batch/{id}/items` element (`BatchItemResponse`). */
export type BatchItem = {
  id: string;
  batch_job_id: string;
  seq: number;
  /** Target object (`repo` or `workspace` plus template variables). */
  target: Record<string, unknown> | string;
  task_session_id: string | null;
  attempt: number;
  status: BatchItemStatus | string;
  check_results: BatchCheckResult[];
  error: string | null;
  started_at: number | null;
  finished_at: number | null;
  /** Part of the mandatory trial (`seq <= trial_size`). */
  trial: boolean;
};

/** `POST /api/batch` body (`CreateBatchJobRequest`, unknown fields rejected). */
export type CreateBatchJobRequest = {
  title: string;
  template: { prompt: string };
  targets: Record<string, unknown>[];
  checks: BatchCheck[];
  assistant_id: string;
  agent_type?: string;
  project_id?: string;
  mode?: typeof BATCH_MODE_AGENT;
  concurrency?: number;
  item_timeout_sec?: number;
  trial_size?: number;
};

/** `POST /api/batch/{id}/retry` body: explicit `item_ids`, or `filter: 'failed'`. */
export type BatchRetryRequest = { item_ids: string[] } | { filter: 'failed' };

export type BatchJobUpdatedEvent = {
  user_id?: string;
  job_id: string;
  status: string;
};

export type BatchItemUpdatedEvent = {
  user_id?: string;
  job_id: string;
  item_id: string;
  status: string;
};

/** Narrow a string to a known job status (no throw). */
export function asBatchJobStatus(value: string): BatchJobStatus | null {
  return (BATCH_JOB_STATUSES as readonly string[]).includes(value) ? (value as BatchJobStatus) : null;
}

/** Narrow a string to a known item status (no throw). */
export function asBatchItemStatus(value: string): BatchItemStatus | null {
  return (BATCH_ITEM_STATUSES as readonly string[]).includes(value) ? (value as BatchItemStatus) : null;
}
