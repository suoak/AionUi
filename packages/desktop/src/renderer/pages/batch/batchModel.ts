/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M8 E8-5: pure helpers for the batch job pages — target parsing, create
 * request building, error mapping and phase / action derivation. Everything
 * here mirrors Core `aionui-batch` (validate.rs / service.rs / routes.rs) so
 * the UI can explain a refusal instead of guessing at it; Core stays the
 * source of truth and re-validates every request.
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import {
  BATCH_DEFAULT_CONCURRENCY,
  BATCH_DEFAULT_ITEM_TIMEOUT_SEC,
  BATCH_DEFAULT_TRIAL_SIZE,
  BATCH_INTERRUPTED_ERROR,
  BATCH_MAX_CHECKS,
  BATCH_MAX_TARGETS,
  BATCH_MODE_AGENT,
  type BatchCheck,
  type BatchCheckKind,
  type BatchItem,
  type BatchJob,
  type CreateBatchJobRequest,
} from '@/common/types/agent/batch';

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export type TargetPathKind = 'repo' | 'workspace';

export type TargetIssue =
  | { index: number; code: 'notObject' }
  | { index: number; code: 'needsLocation' }
  | { index: number; code: 'bothLocations' }
  | { index: number; code: 'notAbsolute'; path: string }
  | { index: number; code: 'duplicate'; path: string }
  | { index: number; code: 'missingField'; field: string };

export type TargetParseResult = {
  targets: Record<string, unknown>[];
  /** Whole-input problem (unparseable, empty, too many). */
  error: 'empty' | 'invalidJson' | 'invalidCsv' | 'tooMany' | null;
  issues: TargetIssue[];
};

/** Absolute on POSIX (`/…`), Windows (`C:\…`, `C:/…`) or UNC (`\\host\…`) — Core `Path::is_absolute`. */
export const isAbsolutePath = (p: string): boolean =>
  p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\');

/** Minimal RFC 4180 line splitter (quoted fields, `""` escapes). */
export const splitCsvLine = (line: string): string[] | null => {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cur += c;
      }
    } else if (c === '"' && cur.trim() === '') {
      quoted = true;
      cur = '';
    } else if (c === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  if (quoted) return null;
  out.push(cur.trim());
  return out;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const parseRaw = (text: string, pathKind: TargetPathKind): { values: unknown[]; error: TargetParseResult['error'] } => {
  const trimmed = text.trim();
  if (!trimmed) return { values: [], error: 'empty' };
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return Array.isArray(parsed) ? { values: parsed, error: null } : { values: [], error: 'invalidJson' };
    } catch {
      return { values: [], error: 'invalidJson' };
    }
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines[0].startsWith('{')) {
    const values: unknown[] = [];
    for (const line of lines) {
      try {
        values.push(JSON.parse(line));
      } catch {
        return { values: [], error: 'invalidJson' };
      }
    }
    return { values, error: null };
  }
  const header = splitCsvLine(lines[0]);
  if (header && lines[0].includes(',') && header.some((h) => h === 'repo' || h === 'workspace')) {
    const values: unknown[] = [];
    for (const line of lines.slice(1)) {
      const cells = splitCsvLine(line);
      if (!cells || cells.length > header.length) return { values: [], error: 'invalidCsv' };
      const row: Record<string, unknown> = {};
      header.forEach((key, i) => {
        const cell = cells[i] ?? '';
        if (key && cell !== '') row[key] = cell;
      });
      values.push(row);
    }
    return { values, error: values.length === 0 ? 'empty' : null };
  }
  // One absolute path per line.
  return { values: lines.map((path) => ({ [pathKind]: path })), error: null };
};

/** Template fields referenced as `{{target.<key>}}`. */
export const templateFields = (prompt: string): string[] => {
  const out = new Set<string>();
  for (const m of prompt.matchAll(/\{\{\s*target\.([A-Za-z0-9_-]+)\s*\}\}/g)) out.add(m[1]);
  return [...out];
};

/**
 * Parse pasted targets: a JSON array, JSON Lines, a CSV with a `repo` or
 * `workspace` header column, or one absolute path per line (`pathKind`).
 */
export const parseTargets = (text: string, pathKind: TargetPathKind = 'repo', prompt = ''): TargetParseResult => {
  const { values, error } = parseRaw(text, pathKind);
  if (error) return { targets: [], error, issues: [] };
  if (values.length > BATCH_MAX_TARGETS) return { targets: [], error: 'tooMany', issues: [] };
  const issues: TargetIssue[] = [];
  const targets: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const fields = templateFields(prompt);
  values.forEach((value, index) => {
    if (!isPlainObject(value)) {
      issues.push({ index, code: 'notObject' });
      return;
    }
    targets.push(value);
    const repo = typeof value.repo === 'string' ? value.repo.trim() : '';
    const workspace = typeof value.workspace === 'string' ? value.workspace.trim() : '';
    if (repo && workspace) {
      issues.push({ index, code: 'bothLocations' });
    } else if (!repo && !workspace) {
      issues.push({ index, code: 'needsLocation' });
    } else {
      const path = repo || workspace;
      if (!isAbsolutePath(path)) {
        issues.push({ index, code: 'notAbsolute', path });
      } else if (workspace) {
        if (seen.has(path)) issues.push({ index, code: 'duplicate', path });
        seen.add(path);
      }
    }
    for (const field of fields) {
      if (value[field] === undefined || value[field] === null) issues.push({ index, code: 'missingField', field });
    }
  });
  return { targets, error: targets.length === 0 ? 'empty' : null, issues };
};

/** Short label for a target (its repo / workspace path, else compact JSON). */
export const targetLabel = (target: BatchItem['target']): string => {
  if (typeof target === 'string') return target;
  const path = target.repo ?? target.workspace;
  if (typeof path === 'string' && path) return path;
  return JSON.stringify(target);
};

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export type CheckDraft = {
  key: string;
  kind: BatchCheckKind;
  /** file_exists / json_schema relative path. */
  path: string;
  /** glob pattern. */
  pattern: string;
  min: string;
  max: string;
  /** json_schema schema as JSON text. */
  schema: string;
};

let draftSeq = 0;

export const newCheckDraft = (kind: BatchCheckKind = 'file_exists'): CheckDraft => ({
  key: `check-${++draftSeq}`,
  kind,
  path: '',
  pattern: '',
  min: '',
  max: '',
  schema: '',
});

export type CheckIssue =
  | 'pathRequired'
  | 'pathNotRelative'
  | 'patternRequired'
  | 'countInvalid'
  | 'maxBelowMin'
  | 'schemaInvalid';

/** Mirrors Core `safe_relative`: relative, no `..` segment. */
const isSafeRelative = (p: string): boolean =>
  !isAbsolutePath(p) && !p.split(/[\\/]/).some((seg) => seg === '..') && !/^[A-Za-z]:/.test(p);

const parseCount = (v: string): number | undefined | null => {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

export const buildCheck = (draft: CheckDraft): { check: BatchCheck | null; issue: CheckIssue | null } => {
  if (draft.kind === 'glob') {
    const pattern = draft.pattern.trim();
    if (!pattern) return { check: null, issue: 'patternRequired' };
    if (!isSafeRelative(pattern)) return { check: null, issue: 'pathNotRelative' };
    const min = parseCount(draft.min);
    const max = parseCount(draft.max);
    if (min === null || max === null) return { check: null, issue: 'countInvalid' };
    if (max !== undefined && max < (min ?? 1)) return { check: null, issue: 'maxBelowMin' };
    const check: BatchCheck = { kind: 'glob', pattern };
    if (min !== undefined) check.min = min;
    if (max !== undefined) check.max = max;
    return { check, issue: null };
  }
  const path = draft.path.trim();
  if (!path) return { check: null, issue: 'pathRequired' };
  if (!isSafeRelative(path)) return { check: null, issue: 'pathNotRelative' };
  if (draft.kind === 'file_exists') return { check: { kind: 'file_exists', path }, issue: null };
  let schema: unknown;
  try {
    schema = JSON.parse(draft.schema);
  } catch {
    return { check: null, issue: 'schemaInvalid' };
  }
  if (typeof schema !== 'boolean' && !isPlainObject(schema)) return { check: null, issue: 'schemaInvalid' };
  return { check: { kind: 'json_schema', path, schema }, issue: null };
};

// ---------------------------------------------------------------------------
// Create request
// ---------------------------------------------------------------------------

export type BatchForm = {
  title: string;
  assistantId: string;
  prompt: string;
  targetsText: string;
  pathKind: TargetPathKind;
  checks: CheckDraft[];
  concurrency: number;
  /** Minutes (Core takes seconds, 60 s .. 4 h). */
  timeoutMinutes: number;
  trialSize: number;
};

export const defaultBatchForm = (): BatchForm => ({
  title: '',
  assistantId: '',
  prompt: '',
  targetsText: '',
  pathKind: 'repo',
  checks: [newCheckDraft('file_exists')],
  concurrency: BATCH_DEFAULT_CONCURRENCY,
  timeoutMinutes: BATCH_DEFAULT_ITEM_TIMEOUT_SEC / 60,
  trialSize: BATCH_DEFAULT_TRIAL_SIZE,
});

export type FormIssue =
  | 'titleRequired'
  | 'assistantRequired'
  | 'promptRequired'
  | 'targetsInvalid'
  | 'checksRequired'
  | 'tooManyChecks'
  | 'checkInvalid'
  | 'trialTooLarge';

export const buildCreateRequest = (form: BatchForm): { request: CreateBatchJobRequest | null; issues: FormIssue[] } => {
  const issues: FormIssue[] = [];
  if (!form.title.trim()) issues.push('titleRequired');
  if (!form.assistantId) issues.push('assistantRequired');
  if (!form.prompt.trim()) issues.push('promptRequired');
  const parsed = parseTargets(form.targetsText, form.pathKind, form.prompt);
  if (parsed.error || parsed.issues.length > 0) issues.push('targetsInvalid');
  if (form.checks.length === 0) issues.push('checksRequired');
  if (form.checks.length > BATCH_MAX_CHECKS) issues.push('tooManyChecks');
  const checks: BatchCheck[] = [];
  for (const draft of form.checks) {
    const { check } = buildCheck(draft);
    if (check) checks.push(check);
  }
  if (checks.length !== form.checks.length) issues.push('checkInvalid');
  if (!parsed.error && form.trialSize > parsed.targets.length) issues.push('trialTooLarge');
  if (issues.length > 0) return { request: null, issues };
  return {
    request: {
      title: form.title.trim(),
      template: { prompt: form.prompt },
      targets: parsed.targets,
      checks,
      assistant_id: form.assistantId,
      mode: BATCH_MODE_AGENT,
      concurrency: form.concurrency,
      item_timeout_sec: Math.round(form.timeoutMinutes * 60),
      trial_size: form.trialSize,
    },
    issues,
  };
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

const ERR = 'conversation.batchJobs.errors';

/**
 * i18n key for a refused batch call. 409 `BATCH_INVALID_STATE` is split by
 * Core's message (service.rs) so "not trialed yet" / "trial still running" /
 * "trial not all passed" each read as their own instruction.
 */
export const batchErrorKey = (error: unknown): string => {
  if (!isBackendHttpError(error)) return `${ERR}.generic`;
  const msg = error.backendMessage;
  switch (error.status) {
    case 400:
      return `${ERR}.badRequest`;
    case 403:
      return `${ERR}.agentDenied`;
    case 404:
      return `${ERR}.notFound`;
    case 409:
      if (/cannot scale a batch job in status 'draft'/.test(msg)) return `${ERR}.notTrialed`;
      if (/trial is still running/.test(msg)) return `${ERR}.trialRunning`;
      if (/every trial item must pass/.test(msg)) return `${ERR}.trialNotPassed`;
      if (/only trial items can be retried/.test(msg)) return `${ERR}.retryTrialOnly`;
      if (/no retryable items/.test(msg)) return `${ERR}.noRetryable`;
      if (/changed state concurrently/.test(msg)) return `${ERR}.concurrent`;
      return `${ERR}.invalidState`;
    case 424:
      return `${ERR}.unavailable`;
    case 507:
      return `${ERR}.insufficientDisk`;
    default:
      return `${ERR}.generic`;
  }
};

/** Core's own message, shown as the detail line under the localized one. */
export const batchErrorReason = (error: unknown): string | null => {
  if (!isBackendHttpError(error)) return error instanceof Error && error.message ? error.message : null;
  const msg = error.backendMessage.trim();
  return msg || null;
};

/**
 * 507 shortfall parsed from Core's message (`need ~N MiB, M MiB free`,
 * batch_adapters.rs); null when the message has another shape.
 */
export const diskShortfall = (error: unknown): { needMiB: number; freeMiB: number } | null => {
  if (!isBackendHttpError(error) || error.status !== 507) return null;
  const m = /need ~(\d+) MiB, (\d+) MiB free/.exec(error.backendMessage);
  return m ? { needMiB: Number(m[1]), freeMiB: Number(m[2]) } : null;
};

// ---------------------------------------------------------------------------
// Phase & actions
// ---------------------------------------------------------------------------

export type BatchPhase =
  | 'draft'
  | 'trialRunning'
  | 'trialPassed'
  | 'trialFailed'
  | 'running'
  | 'pausedAfterRestart'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'unknown';

const isTrialItemPassed = (i: BatchItem) => i.status === 'passed' || i.status === 'skipped';

export const batchPhase = (job: BatchJob, items: BatchItem[]): BatchPhase => {
  switch (job.status) {
    case 'draft':
      return 'draft';
    case 'trial': {
      if (!job.trial_settled) return 'trialRunning';
      const trial = items.filter((i) => i.trial);
      return trial.length > 0 && trial.every(isTrialItemPassed) ? 'trialPassed' : 'trialFailed';
    }
    case 'running':
      return 'running';
    case 'paused':
      return items.some((i) => i.error === BATCH_INTERRUPTED_ERROR) ? 'pausedAfterRestart' : 'paused';
    case 'completed':
    case 'failed':
    case 'cancelled':
      return job.status;
    default:
      return 'unknown';
  }
};

/** Alert type for the phase banner. */
export const phaseAlertType = (phase: BatchPhase): 'info' | 'success' | 'warning' | 'error' => {
  switch (phase) {
    case 'trialPassed':
    case 'completed':
      return 'success';
    case 'trialFailed':
    case 'pausedAfterRestart':
    case 'paused':
      return 'warning';
    case 'failed':
      return 'error';
    default:
      return 'info';
  }
};

export const isRetryableItem = (item: BatchItem): boolean =>
  item.status === 'failed' || item.status === 'timeout' || item.status === 'cancelled';

export type BatchActions = {
  trial: boolean;
  scale: boolean;
  /** Why scale is disabled, as an i18n key (null when enabled or not applicable). */
  scaleHint: string | null;
  retryFailed: boolean;
  cancel: boolean;
  /** Per-item retry is allowed for this item. */
  retryItem: (item: BatchItem) => boolean;
};

const RETRY_JOB_STATES = new Set(['trial', 'running', 'paused', 'failed', 'completed']);

export const batchActions = (job: BatchJob, items: BatchItem[]): BatchActions => {
  const phase = batchPhase(job, items);
  const status = job.status;
  const retryJob = RETRY_JOB_STATES.has(status) && !(status === 'trial' && !job.trial_settled);
  const inScope = (i: BatchItem) => (status === 'trial' ? i.trial : true);
  const failedFilterable = items.some((i) => inScope(i) && (i.status === 'failed' || i.status === 'timeout'));
  let scaleHint: string | null = null;
  if (status === 'draft') scaleHint = 'conversation.batchJobs.hints.trialFirst';
  else if (phase === 'trialRunning') scaleHint = 'conversation.batchJobs.hints.trialRunning';
  else if (phase === 'trialFailed') scaleHint = 'conversation.batchJobs.hints.trialNotPassed';
  return {
    trial: status === 'draft',
    scale: phase === 'trialPassed' || status === 'paused',
    scaleHint,
    retryFailed: retryJob && failedFilterable,
    cancel: status === 'draft' || status === 'trial' || status === 'running' || status === 'paused',
    retryItem: (item) => retryJob && inScope(item) && isRetryableItem(item),
  };
};

/** Settled share of the in-scope items, 0..100 (trial items only before scaling). */
export const batchProgress = (job: BatchJob, items: BatchItem[]): { done: number; total: number; percent: number } => {
  const scoped = job.status === 'trial' || job.status === 'draft' ? items.filter((i) => i.trial) : items;
  const total = scoped.length || (job.status === 'trial' || job.status === 'draft' ? job.trial_size : job.counts.total);
  const done = scoped.filter((i) => i.status !== 'pending' && i.status !== 'running').length;
  return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
};

export const isBatchLive = (job: BatchJob): boolean => job.status === 'trial' || job.status === 'running';

/** Safe file name for the CSV export. */
export const exportFileName = (job: BatchJob): string => {
  const base = job.title.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'batch'}-${job.id.slice(0, 8)}.csv`;
};

export const checksSummary = (item: BatchItem): { ok: number; total: number } => ({
  ok: item.check_results.filter((r) => r.ok).length,
  total: item.check_results.length,
});
