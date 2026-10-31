/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { BATCH_INTERRUPTED_ERROR, type BatchItem, type BatchJob } from '@/common/types/agent/batch';
import {
  batchActions,
  batchErrorKey,
  batchErrorReason,
  batchPhase,
  batchProgress,
  buildCheck,
  buildCreateRequest,
  defaultBatchForm,
  diskShortfall,
  exportFileName,
  isAbsolutePath,
  newCheckDraft,
  parseTargets,
  splitCsvLine,
  targetLabel,
  templateFields,
} from '@/renderer/pages/batch/batchModel';

const err = (status: number, code: string, message: string) =>
  new BackendHttpError({ method: 'POST', path: '/api/batch/j1/scale', status, body: { error: message, code } });

const job = (patch: Partial<BatchJob> = {}): BatchJob => ({
  id: 'job-123456789',
  title: 'Dep audit',
  project_id: null,
  template: { prompt: 'Audit {{target}}' },
  agent_type: null,
  assistant_id: 'a1',
  mode: 'agent',
  concurrency: 4,
  item_timeout_sec: 1800,
  checks: [{ kind: 'file_exists', path: 'report.json' }],
  status: 'draft',
  trial_size: 1,
  counts: { total: 3, pending: 3, running: 0, passed: 0, failed: 0, timeout: 0, skipped: 0, cancelled: 0 },
  trial_settled: false,
  created_at: 1,
  updated_at: 1,
  ...patch,
});

const item = (seq: number, patch: Partial<BatchItem> = {}): BatchItem => ({
  id: `i${seq}`,
  batch_job_id: 'job-123456789',
  seq,
  target: { repo: `/r/${seq}` },
  task_session_id: null,
  attempt: 0,
  status: 'pending',
  check_results: [],
  error: null,
  started_at: null,
  finished_at: null,
  trial: seq === 1,
  ...patch,
});

describe('batch targets', () => {
  it('recognises absolute paths across platforms', () => {
    expect(isAbsolutePath('/a')).toBe(true);
    expect(isAbsolutePath('C:\\a')).toBe(true);
    expect(isAbsolutePath('\\\\host\\share')).toBe(true);
    expect(isAbsolutePath('a/b')).toBe(false);
  });

  it('splits quoted CSV cells', () => {
    expect(splitCsvLine('a,"b,c","d""e"')).toEqual(['a', 'b,c', 'd"e']);
    expect(splitCsvLine('"open')).toBeNull();
  });

  it('parses plain path lines using the chosen kind', () => {
    expect(parseTargets('/r/a\n\n/r/b', 'workspace').targets).toEqual([{ workspace: '/r/a' }, { workspace: '/r/b' }]);
  });

  it('parses JSON arrays, JSON Lines and CSV', () => {
    expect(parseTargets('[{"repo":"/a","name":"x"}]').targets).toEqual([{ repo: '/a', name: 'x' }]);
    expect(parseTargets('{"repo":"/a"}\n{"repo":"/b"}').targets).toHaveLength(2);
    expect(parseTargets('repo,name\n/a,x\n/b,').targets).toEqual([{ repo: '/a', name: 'x' }, { repo: '/b' }]);
  });

  it('reports whole-input errors', () => {
    expect(parseTargets('  ').error).toBe('empty');
    expect(parseTargets('[oops').error).toBe('invalidJson');
    expect(parseTargets('{"a":1}\nnope').error).toBe('invalidJson');
    expect(parseTargets('repo,name\n"/a,x').error).toBe('invalidCsv');
    expect(parseTargets(Array.from({ length: 501 }, (_, i) => `/r/${i}`).join('\n')).error).toBe('tooMany');
  });

  it('mirrors Core per-target validation', () => {
    const r = parseTargets(
      JSON.stringify([
        1,
        {},
        { repo: '/a', workspace: '/b' },
        { repo: 'rel' },
        { workspace: '/w' },
        { workspace: '/w' },
      ]),
      'repo',
      'Fix {{target.name}}'
    );
    expect(r.issues.map((i) => i.code)).toEqual([
      'notObject',
      'needsLocation',
      'missingField',
      'bothLocations',
      'missingField',
      'notAbsolute',
      'missingField',
      'missingField',
      'duplicate',
      'missingField',
    ]);
  });

  it('extracts template fields and labels targets', () => {
    expect(templateFields('{{target.name}} {{ target.repo_url }} {{target}} {{seq}}')).toEqual(['name', 'repo_url']);
    expect(targetLabel({ repo: '/a' })).toBe('/a');
    expect(targetLabel({ x: 1 })).toBe('{"x":1}');
    expect(targetLabel('raw')).toBe('raw');
  });
});

describe('batch checks and create request', () => {
  it('builds each check kind and rejects unsafe paths', () => {
    expect(buildCheck({ ...newCheckDraft('file_exists'), path: 'out/r.json' }).check).toEqual({
      kind: 'file_exists',
      path: 'out/r.json',
    });
    expect(buildCheck({ ...newCheckDraft('file_exists'), path: '../x' }).issue).toBe('pathNotRelative');
    expect(buildCheck({ ...newCheckDraft('file_exists'), path: '/x' }).issue).toBe('pathNotRelative');
    expect(buildCheck({ ...newCheckDraft('glob'), pattern: '*.md', min: '2', max: '3' }).check).toEqual({
      kind: 'glob',
      pattern: '*.md',
      min: 2,
      max: 3,
    });
    expect(buildCheck({ ...newCheckDraft('glob'), pattern: '*.md', max: '0' }).issue).toBe('maxBelowMin');
    expect(buildCheck({ ...newCheckDraft('glob'), pattern: '*.md', min: '1.5' }).issue).toBe('countInvalid');
    expect(buildCheck({ ...newCheckDraft('json_schema'), path: 'r.json', schema: '[1]' }).issue).toBe('schemaInvalid');
    expect(buildCheck({ ...newCheckDraft('json_schema'), path: 'r.json', schema: 'true' }).check).toEqual({
      kind: 'json_schema',
      path: 'r.json',
      schema: true,
    });
  });

  it('lists every form issue at once', () => {
    const form = { ...defaultBatchForm(), trialSize: 2 };
    expect(buildCreateRequest(form).issues).toEqual([
      'titleRequired',
      'assistantRequired',
      'promptRequired',
      'targetsInvalid',
      'checkInvalid',
    ]);
    const tooBig = { ...form, title: 't', assistantId: 'a', prompt: 'p', targetsText: '/a' };
    tooBig.checks = [{ ...newCheckDraft(), path: 'r.json' }];
    expect(buildCreateRequest(tooBig).issues).toEqual(['trialTooLarge']);
  });

  it('builds the exact Core request body', () => {
    const form = {
      ...defaultBatchForm(),
      title: ' Audit ',
      assistantId: 'a1',
      prompt: 'Audit {{target.name}}',
      targetsText: 'repo,name\n/a,x',
      timeoutMinutes: 2,
      checks: [{ ...newCheckDraft(), path: 'report.json' }],
    };
    expect(buildCreateRequest(form)).toEqual({
      issues: [],
      request: {
        title: 'Audit',
        template: { prompt: 'Audit {{target.name}}' },
        targets: [{ repo: '/a', name: 'x' }],
        checks: [{ kind: 'file_exists', path: 'report.json' }],
        assistant_id: 'a1',
        mode: 'agent',
        concurrency: 4,
        item_timeout_sec: 120,
        trial_size: 1,
      },
    });
  });
});

describe('batch errors', () => {
  it('splits 409 by Core message', () => {
    const k = (m: string) => batchErrorKey(err(409, 'BATCH_INVALID_STATE', m));
    expect(k("cannot scale a batch job in status 'draft'")).toBe('conversation.batchJobs.errors.notTrialed');
    expect(k('trial is still running')).toBe('conversation.batchJobs.errors.trialRunning');
    expect(k('every trial item must pass before scaling (1 not passed)')).toBe(
      'conversation.batchJobs.errors.trialNotPassed'
    );
    expect(k('only trial items can be retried before scaling')).toBe('conversation.batchJobs.errors.retryTrialOnly');
    expect(k('no retryable items')).toBe('conversation.batchJobs.errors.noRetryable');
    expect(k('batch job changed state concurrently')).toBe('conversation.batchJobs.errors.concurrent');
    expect(k("cannot cancel a batch job in status 'completed'")).toBe('conversation.batchJobs.errors.invalidState');
  });

  it('maps the other statuses', () => {
    expect(batchErrorKey(err(400, 'BAD_REQUEST', 'x'))).toBe('conversation.batchJobs.errors.badRequest');
    expect(batchErrorKey(err(403, 'AGENT_SCOPE_DENIED', 'x'))).toBe('conversation.batchJobs.errors.agentDenied');
    expect(batchErrorKey(err(404, 'BATCH_NOT_FOUND', 'x'))).toBe('conversation.batchJobs.errors.notFound');
    expect(batchErrorKey(err(424, 'BATCH_UNAVAILABLE', 'x'))).toBe('conversation.batchJobs.errors.unavailable');
    expect(batchErrorKey(err(507, 'BATCH_INSUFFICIENT_DISK', 'x'))).toBe(
      'conversation.batchJobs.errors.insufficientDisk'
    );
    expect(batchErrorKey(new Error('boom'))).toBe('conversation.batchJobs.errors.generic');
    expect(batchErrorReason(new Error('boom'))).toBe('boom');
  });

  it('parses the 507 shortfall', () => {
    const e = err(
      507,
      'BATCH_INSUFFICIENT_DISK',
      'not enough free disk for 4 concurrent worktrees: need ~2048 MiB, 512 MiB free'
    );
    expect(diskShortfall(e)).toEqual({ needMiB: 2048, freeMiB: 512 });
    expect(diskShortfall(err(507, 'BATCH_INSUFFICIENT_DISK', 'other'))).toBeNull();
    expect(diskShortfall(err(409, 'X', 'need ~1 MiB, 1 MiB free'))).toBeNull();
  });
});

describe('batch phase and actions', () => {
  it('walks the trial gate', () => {
    expect(batchPhase(job(), [item(1)])).toBe('draft');
    expect(batchActions(job(), [item(1)])).toMatchObject({
      trial: true,
      scale: false,
      scaleHint: 'conversation.batchJobs.hints.trialFirst',
      cancel: true,
    });
    const running = job({ status: 'trial' });
    expect(batchPhase(running, [item(1, { status: 'running' })])).toBe('trialRunning');
    expect(batchActions(running, [item(1, { status: 'failed' })]).retryFailed).toBe(false);
    const settled = job({ status: 'trial', trial_settled: true });
    expect(batchPhase(settled, [item(1, { status: 'passed' }), item(2)])).toBe('trialPassed');
    expect(batchActions(settled, [item(1, { status: 'passed' })]).scale).toBe(true);
    const failed = [item(1, { status: 'failed' }), item(2)];
    expect(batchPhase(settled, failed)).toBe('trialFailed');
    const a = batchActions(settled, failed);
    expect(a).toMatchObject({
      scale: false,
      scaleHint: 'conversation.batchJobs.hints.trialNotPassed',
      retryFailed: true,
    });
    expect(a.retryItem(failed[0])).toBe(true);
    expect(a.retryItem(item(2, { status: 'failed' }))).toBe(false);
  });

  it('tells a restart pause apart', () => {
    const paused = job({ status: 'paused' });
    expect(batchPhase(paused, [item(2, { status: 'failed', error: BATCH_INTERRUPTED_ERROR })])).toBe(
      'pausedAfterRestart'
    );
    expect(batchPhase(paused, [item(2)])).toBe('paused');
    expect(batchActions(paused, []).scale).toBe(true);
    expect(batchPhase(job({ status: 'weird' }), [])).toBe('unknown');
    expect(batchActions(job({ status: 'completed' }), []).cancel).toBe(false);
  });

  it('computes progress within scope', () => {
    expect(batchProgress(job({ status: 'trial' }), [item(1, { status: 'passed' }), item(2)])).toEqual({
      done: 1,
      total: 1,
      percent: 100,
    });
    expect(
      batchProgress(job({ status: 'running' }), [item(1, { status: 'passed' }), item(2, { status: 'running' })])
    ).toEqual({ done: 1, total: 2, percent: 50 });
    expect(batchProgress(job({ status: 'running' }), [])).toEqual({ done: 0, total: 3, percent: 0 });
  });

  it('names the export file safely', () => {
    expect(exportFileName(job({ title: 'a/b: c' }))).toBe('a-b-c-job-1234.csv');
    expect(exportFileName(job({ title: '///' }))).toBe('batch-job-1234.csv');
  });
});
