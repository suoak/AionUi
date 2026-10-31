/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M8 E8-5 — demo② batch flow on the batch page against a scripted Core:
 * create a draft (template + targets + checks) → scale is gated → trial →
 * Core pushes item / job updates over WS → trial passed → scale to all →
 * live progress → one item fails → retry it → CSV export. Further cases:
 * 507 disk shortfall on scale, a job paused by an app restart (resume), and
 * 409 refusals mapped to their own instruction.
 *
 * The fake Core keeps one consistent state; every state change Core would
 * make on its own (runner progress, settle) is applied by the test and then
 * pushed over the mocked WS emitters, so nothing depends on timers.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import {
  BATCH_INTERRUPTED_ERROR,
  type BatchCounts,
  type BatchItem,
  type BatchJob,
  type BatchRetryRequest,
  type CreateBatchJobRequest,
} from '@/common/types/agent/batch';

type CoreState = {
  clock: number;
  jobs: Map<string, BatchJob>;
  items: Map<string, BatchItem[]>;
};

const h = vi.hoisted(() => ({
  listeners: new Map<string, Set<(payload: unknown) => void>>(),
  core: null as unknown as CoreState,
  initialParams: '',
  navigate: vi.fn(),
  api: {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    items: vi.fn(),
    trial: vi.fn(),
    scale: vi.fn(),
    retry: vi.fn(),
    cancel: vi.fn(),
    exportCsv: vi.fn(),
    assistants: vi.fn(),
  },
}));

const { wsEmitter } = vi.hoisted(() => ({
  wsEmitter: (name: string) => ({
    on: (cb: (payload: unknown) => void) => {
      if (!h.listeners.has(name)) h.listeners.set(name, new Set());
      h.listeners.get(name)!.add(cb);
      return () => {
        h.listeners.get(name)?.delete(cb);
      };
    },
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    batch: {
      list: { invoke: h.api.list },
      create: { invoke: h.api.create },
      get: { invoke: h.api.get },
      items: { invoke: h.api.items },
      trial: { invoke: h.api.trial },
      scale: { invoke: h.api.scale },
      retry: { invoke: h.api.retry },
      cancel: { invoke: h.api.cancel },
      exportCsv: { invoke: h.api.exportCsv },
      jobUpdated: wsEmitter('batch.jobUpdated'),
      itemUpdated: wsEmitter('batch.itemUpdated'),
    },
    assistants: { list: { invoke: h.api.assistants } },
    realtime: { reconnected: wsEmitter('realtime.reconnected') },
  },
}));

// `?job=` lives in component state so selecting a job re-renders like the router would.
vi.mock('react-router-dom', async () => {
  const { useState } = await vi.importActual<typeof import('react')>('react');
  return {
    useNavigate: () => h.navigate,
    useSearchParams: () => {
      const [params, setParams] = useState(() => new URLSearchParams(h.initialParams));
      return [params, (next: URLSearchParams) => setParams(new URLSearchParams(next))];
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key;
      const vars = Object.entries(opts)
        .filter(([k]) => k !== 'defaultValue')
        .map(([k, v]) => `${k}=${String(v)}`);
      return vars.length > 0 ? `${key}[${vars.join(',')}]` : key;
    },
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => ({ isMobile: false }) }));

vi.mock('@/renderer/pages/settings/components/SettingsPageHeader', () => ({
  default: ({ title, actions }: { title: React.ReactNode; actions?: React.ReactNode }) => (
    <div>
      <div>{title}</div>
      <div>{actions}</div>
    </div>
  ),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

import BatchJobsPage from '@/renderer/pages/batch/BatchJobsPage';

// ---------------------------------------------------------------- fake Core

const REPOS = ['/repos/alpha', '/repos/beta', '/repos/gamma'];
const CSV = 'seq,target,status\n1,/repos/alpha,passed\n';

const tick = () => (h.core.clock += 1000);

const coded = (status: number, code: string, message: string) =>
  new BackendHttpError({ method: 'POST', path: '/api/batch', status, body: { error: message, code } });

const countsOf = (items: BatchItem[]): BatchCounts => {
  const c: BatchCounts = {
    total: items.length,
    pending: 0,
    running: 0,
    passed: 0,
    failed: 0,
    timeout: 0,
    skipped: 0,
    cancelled: 0,
  };
  for (const i of items) c[i.status as keyof Omit<BatchCounts, 'total'>] += 1;
  return c;
};

/** Recompute counts / trial_settled the way Core's job response does. */
const snapshot = (id: string): BatchJob => {
  const job = h.core.jobs.get(id) as BatchJob;
  const items = h.core.items.get(id) ?? [];
  const trial = items.filter((i) => i.trial);
  return {
    ...job,
    counts: countsOf(items),
    trial_settled: trial.length > 0 && trial.every((i) => i.status !== 'pending' && i.status !== 'running'),
  };
};

const setJob = (id: string, patch: Partial<BatchJob>) => {
  h.core.jobs.set(id, { ...(h.core.jobs.get(id) as BatchJob), ...patch, updated_at: tick() });
};

const setItem = (id: string, seq: number, patch: Partial<BatchItem>) => {
  h.core.items.set(
    id,
    (h.core.items.get(id) ?? []).map((i) => (i.seq === seq ? { ...i, ...patch } : i))
  );
};

const seedJob = (id: string, status: BatchJob['status'], items: Partial<BatchItem>[]) => {
  h.core.jobs.set(id, {
    id,
    title: `Seeded ${id}`,
    project_id: null,
    template: { prompt: 'Audit {{target}}' },
    agent_type: null,
    assistant_id: 'asst-1',
    mode: 'agent',
    concurrency: 2,
    item_timeout_sec: 1800,
    checks: [{ kind: 'file_exists', path: 'report.json' }],
    status,
    trial_size: 1,
    counts: countsOf([]),
    trial_settled: false,
    created_at: tick(),
    updated_at: h.core.clock,
  });
  h.core.items.set(
    id,
    items.map((p, idx) => ({
      id: `${id}-i${idx + 1}`,
      batch_job_id: id,
      seq: idx + 1,
      target: { repo: REPOS[idx % REPOS.length] },
      task_session_id: null,
      attempt: 0,
      status: 'pending',
      check_results: [],
      error: null,
      started_at: null,
      finished_at: null,
      trial: idx === 0,
      ...p,
    }))
  );
};

const passItem = (id: string, seq: number) =>
  setItem(id, seq, {
    status: 'passed',
    task_session_id: `ts-${id}-${seq}`,
    check_results: [{ kind: 'file_exists', ok: true }],
    finished_at: tick(),
  });

const installCore = () => {
  h.core = { clock: 1_700_000_000_000, jobs: new Map(), items: new Map() };
  const { api } = h;
  const need = (id: string) => {
    if (!h.core.jobs.has(id)) throw coded(404, 'BATCH_NOT_FOUND', `batch job ${id} not found`);
  };
  api.assistants.mockResolvedValue([
    { id: 'asst-off', name: 'Disabled', enabled: false },
    { id: 'asst-1', name: 'Auditor', enabled: true },
  ]);
  api.list.mockImplementation(async () => [...h.core.jobs.keys()].reverse().map(snapshot));
  api.get.mockImplementation(async ({ id }: { id: string }) => {
    need(id);
    return snapshot(id);
  });
  api.items.mockImplementation(async ({ id }: { id: string }) => {
    need(id);
    return [...(h.core.items.get(id) ?? [])];
  });
  api.create.mockImplementation(async (req: CreateBatchJobRequest) => {
    const id = `job-${h.core.jobs.size + 1}`;
    h.core.jobs.set(id, {
      id,
      title: req.title,
      project_id: null,
      template: req.template,
      agent_type: null,
      assistant_id: req.assistant_id,
      mode: req.mode ?? 'agent',
      concurrency: req.concurrency ?? 4,
      item_timeout_sec: req.item_timeout_sec ?? 1800,
      checks: req.checks,
      status: 'draft',
      trial_size: req.trial_size ?? 1,
      counts: countsOf([]),
      trial_settled: false,
      created_at: tick(),
      updated_at: h.core.clock,
    });
    h.core.items.set(
      id,
      req.targets.map((target, idx) => ({
        id: `${id}-i${idx + 1}`,
        batch_job_id: id,
        seq: idx + 1,
        target,
        task_session_id: null,
        attempt: 0,
        status: 'pending',
        check_results: [],
        error: null,
        started_at: null,
        finished_at: null,
        trial: idx + 1 <= (req.trial_size ?? 1),
      }))
    );
    return snapshot(id);
  });
  api.trial.mockImplementation(async ({ id }: { id: string }) => {
    need(id);
    const job = snapshot(id);
    if (job.status !== 'draft') {
      throw coded(409, 'BATCH_INVALID_STATE', `cannot start the trial of a batch job in status '${job.status}'`);
    }
    setJob(id, { status: 'trial' });
    for (const i of h.core.items.get(id) ?? []) {
      if (i.trial) setItem(id, i.seq, { status: 'running', attempt: 1, started_at: tick() });
    }
    return snapshot(id);
  });
  api.scale.mockImplementation(async ({ id }: { id: string }) => {
    need(id);
    const job = snapshot(id);
    if (job.status === 'draft') throw coded(409, 'BATCH_INVALID_STATE', "cannot scale a batch job in status 'draft'");
    if (job.status === 'trial') {
      if (!job.trial_settled) throw coded(409, 'BATCH_INVALID_STATE', 'trial is still running');
      const notPassed = (h.core.items.get(id) ?? []).filter((i) => i.trial && i.status !== 'passed').length;
      if (notPassed > 0) {
        throw coded(409, 'BATCH_INVALID_STATE', `every trial item must pass before scaling (${notPassed} not passed)`);
      }
    }
    setJob(id, { status: 'running' });
    return snapshot(id);
  });
  api.retry.mockImplementation(async ({ id, request }: { id: string; request: BatchRetryRequest }) => {
    need(id);
    const items = h.core.items.get(id) ?? [];
    const picked =
      'item_ids' in request
        ? items.filter((i) => request.item_ids.includes(i.id))
        : items.filter((i) => i.status === 'failed' || i.status === 'timeout');
    if (picked.length === 0) throw coded(409, 'BATCH_INVALID_STATE', 'no retryable items');
    for (const i of picked) setItem(id, i.seq, { status: 'pending', error: null, check_results: [] });
    const job = snapshot(id);
    if (job.status === 'failed' || job.status === 'completed') setJob(id, { status: 'running' });
    return snapshot(id);
  });
  api.cancel.mockImplementation(async ({ id }: { id: string }) => {
    need(id);
    setJob(id, { status: 'cancelled' });
    return snapshot(id);
  });
  api.exportCsv.mockResolvedValue(CSV);
};

// ------------------------------------------------------------ Core pushes

const push = (name: string, payload: unknown) =>
  act(() => {
    for (const cb of h.listeners.get(name) ?? []) cb(payload);
  });

const pushItem = (id: string, seq: number) => {
  const item = (h.core.items.get(id) ?? []).find((i) => i.seq === seq) as BatchItem;
  push('batch.itemUpdated', { job_id: id, item_id: item.id, status: item.status });
};

const pushJob = (id: string) => push('batch.jobUpdated', { job_id: id, status: snapshot(id).status });

// ------------------------------------------------------------------ UI

const renderPage = (params = '') => {
  h.initialParams = params;
  return render(<BatchJobsPage />);
};

const field = (testId: string) => {
  const el = screen.getByTestId(testId);
  return (el.matches('input,textarea') ? el : el.querySelector('input,textarea')) as HTMLElement;
};

const type = (testId: string, value: string) => fireEvent.change(field(testId), { target: { value } });

const actionButton = (name: string) => screen.getByTestId(`batch-action-${name}`) as HTMLButtonElement;

const itemStatus = (seq: number) => screen.getByTestId(`batch-item-status-${seq}`).textContent;

const createDraft = async () => {
  fireEvent.click(screen.getByTestId('batch-new'));
  await waitFor(() => expect(h.api.assistants).toHaveBeenCalled());
  type('batch-form-title', 'Dependency audit');
  type('batch-form-prompt', 'Audit {{target.repo}} and write report.json');
  type('batch-form-targets', REPOS.join('\n'));
  await waitFor(() =>
    expect(screen.getByTestId('batch-form-targets-preview').textContent).toBe(
      'conversation.batchJobs.form.targetCount[count=3]'
    )
  );
  type('batch-form-check-path-0', 'report.json');
  fireEvent.click(screen.getByTestId('batch-create-submit'));
  await waitFor(() => expect(h.api.create).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByTestId('batch-phase-draft')).toBeTruthy());
};

beforeEach(() => {
  h.listeners.clear();
  h.navigate.mockReset();
  for (const fn of Object.values(h.api)) fn.mockReset();
  installCore();
  vi.spyOn(Message, 'success').mockImplementation(() => () => undefined);
  vi.spyOn(Message, 'error').mockImplementation(() => () => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('demo② batch flow (E8-5)', () => {
  it('create → trial → scale → progress → retry a failed item → CSV export', async () => {
    renderPage();
    await waitFor(() => expect(h.api.list).toHaveBeenCalled());
    await createDraft();

    // Core gets exactly the body the drawer built (first enabled assistant preselected).
    expect(h.api.create).toHaveBeenCalledWith({
      title: 'Dependency audit',
      template: { prompt: 'Audit {{target.repo}} and write report.json' },
      targets: REPOS.map((repo) => ({ repo })),
      checks: [{ kind: 'file_exists', path: 'report.json' }],
      assistant_id: 'asst-1',
      mode: 'agent',
      concurrency: 4,
      item_timeout_sec: 1800,
      trial_size: 1,
    });
    expect(screen.getByTestId('batch-list-item-job-1')).toBeTruthy();

    // Draft: scale is shown but gated behind the trial.
    expect(actionButton('scale').disabled).toBe(true);
    expect(screen.getByTestId('batch-progress-text').textContent).toBe('0/1');

    fireEvent.click(actionButton('trial'));
    await waitFor(() => expect(h.api.trial).toHaveBeenCalledWith({ id: 'job-1' }));
    await waitFor(() => expect(screen.getByTestId('batch-phase-trialRunning')).toBeTruthy());
    expect(itemStatus(1)).toBe('conversation.batchJobs.status.running');
    expect(actionButton('scale').disabled).toBe(true);

    // Runner: the trial item passes its checks → itemUpdated push.
    passItem('job-1', 1);
    pushItem('job-1', 1);
    await waitFor(() => expect(screen.getByTestId('batch-phase-trialPassed')).toBeTruthy());
    expect(screen.getByTestId('batch-item-checks-1').textContent).toBe('1/1');
    expect(screen.getByTestId('batch-progress-text').textContent).toBe('1/1');
    expect(actionButton('scale').disabled).toBe(false);

    // Open the item's session.
    fireEvent.click(screen.getByTestId('batch-item-open-1'));
    expect(h.navigate).toHaveBeenCalledWith('/tasks?task=ts-job-1-1');

    fireEvent.click(actionButton('scale'));
    await waitFor(() => expect(h.api.scale).toHaveBeenCalledWith({ id: 'job-1' }));
    await waitFor(() => expect(screen.getByTestId('batch-phase-running')).toBeTruthy());
    expect(screen.getByTestId('batch-progress-text').textContent).toBe('1/3');

    // Live progress: item 2 runs then passes, item 3 fails a check.
    setItem('job-1', 2, { status: 'running', attempt: 1 });
    pushItem('job-1', 2);
    await waitFor(() => expect(itemStatus(2)).toBe('conversation.batchJobs.status.running'));
    passItem('job-1', 2);
    pushItem('job-1', 2);
    setItem('job-1', 3, {
      status: 'failed',
      attempt: 1,
      error: 'checks failed',
      check_results: [{ kind: 'file_exists', ok: false, detail: 'report.json missing' }],
    });
    pushItem('job-1', 3);
    await waitFor(() => expect(itemStatus(3)).toBe('conversation.batchJobs.status.failed'));
    expect(screen.getByTestId('batch-progress-text').textContent).toBe('3/3');
    expect(screen.getByTestId('batch-item-checks-3').textContent).toBe('0/1');

    // Runner settle: not every item passed → failed.
    setJob('job-1', { status: 'failed' });
    pushJob('job-1');
    await waitFor(() => expect(screen.getByTestId('batch-phase-failed')).toBeTruthy());
    expect(screen.getByTestId('batch-count-failed').textContent).toBe('conversation.batchJobs.status.failed 1');
    expect(screen.queryByTestId('batch-item-retry-1')).toBeNull();

    // Retry just the failed item.
    fireEvent.click(screen.getByTestId('batch-item-retry-3'));
    await waitFor(() => expect(h.api.retry).toHaveBeenCalledWith({ id: 'job-1', request: { item_ids: ['job-1-i3'] } }));
    await waitFor(() => expect(screen.getByTestId('batch-phase-running')).toBeTruthy());
    expect(itemStatus(3)).toBe('conversation.batchJobs.status.pending');
    setItem('job-1', 3, { status: 'running', attempt: 2 });
    pushItem('job-1', 3);
    await waitFor(() =>
      expect(within(screen.getByTestId('batch-item-3')).getByText(/attempt\[count=2\]/)).toBeTruthy()
    );
    passItem('job-1', 3);
    setJob('job-1', { status: 'completed' });
    pushJob('job-1');
    await waitFor(() => expect(screen.getByTestId('batch-phase-completed')).toBeTruthy());
    expect(screen.queryByTestId('batch-action-cancel')).toBeNull();

    // CSV export downloads Core's text as is.
    const createUrl = vi.fn((_blob: Blob) => 'blob:csv');
    const revokeUrl = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(actionButton('export'));
    await waitFor(() => expect(h.api.exportCsv).toHaveBeenCalledWith({ id: 'job-1' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const blob = createUrl.mock.calls[0][0];
    expect(await blob.text()).toBe(CSV);
    expect((click.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe('Dependency-audit-job-1.csv');
    expect(revokeUrl).toHaveBeenCalledWith('blob:csv');
  });

  it('shows the 507 disk shortfall when scaling', async () => {
    seedJob('job-d', 'trial', [{ status: 'passed', check_results: [{ kind: 'file_exists', ok: true }] }, {}, {}]);
    h.api.scale.mockRejectedValueOnce(
      coded(
        507,
        'BATCH_INSUFFICIENT_DISK',
        'not enough free disk for 2 concurrent worktrees: need ~4096 MiB, 1024 MiB free'
      )
    );
    renderPage('job=job-d');
    await waitFor(() => expect(screen.getByTestId('batch-phase-trialPassed')).toBeTruthy());
    fireEvent.click(actionButton('scale'));
    const alert = await screen.findByTestId('batch-action-error');
    expect(alert.textContent).toContain('conversation.batchJobs.errors.insufficientDisk');
    expect(alert.textContent).toContain('conversation.batchJobs.diskDetail[need=4096,free=1024]');
    expect(alert.textContent).toContain('need ~4096 MiB, 1024 MiB free');
    expect(Message.error).toHaveBeenCalledWith('conversation.batchJobs.errors.insufficientDisk');
    // Nothing changed in Core; the job is still in its trial-passed state.
    expect(screen.getByTestId('batch-phase-trialPassed')).toBeTruthy();
  });

  it('explains a pause caused by an app restart and resumes it', async () => {
    seedJob('job-p', 'paused', [
      { status: 'passed', check_results: [{ kind: 'file_exists', ok: true }] },
      { status: 'failed', attempt: 1, error: BATCH_INTERRUPTED_ERROR },
      {},
    ]);
    renderPage('job=job-p');
    await waitFor(() => expect(screen.getByTestId('batch-phase-pausedAfterRestart')).toBeTruthy());
    expect(within(screen.getByTestId('batch-item-2')).getByText(BATCH_INTERRUPTED_ERROR)).toBeTruthy();
    expect(actionButton('scale').textContent).toBe('conversation.batchJobs.actions.resume[count=3]');
    expect(screen.getByTestId('batch-item-retry-2')).toBeTruthy();

    fireEvent.click(actionButton('scale'));
    await waitFor(() => expect(h.api.scale).toHaveBeenCalledWith({ id: 'job-p' }));
    await waitFor(() => expect(screen.getByTestId('batch-phase-running')).toBeTruthy());

    // Retry the interrupted item via the bulk action.
    fireEvent.click(actionButton('retry-failed'));
    await waitFor(() => expect(h.api.retry).toHaveBeenCalledWith({ id: 'job-p', request: { filter: 'failed' } }));
    await waitFor(() => expect(itemStatus(2)).toBe('conversation.batchJobs.status.pending'));
  });

  it('maps 409 refusals to their own instruction and refreshes', async () => {
    // A stale view: the UI still thinks the trial passed, Core says one trial item did not.
    seedJob('job-c', 'trial', [{ status: 'passed', check_results: [{ kind: 'file_exists', ok: true }] }, {}]);
    renderPage('job=job-c');
    await waitFor(() => expect(screen.getByTestId('batch-phase-trialPassed')).toBeTruthy());
    setItem('job-c', 1, { status: 'failed', error: 'checks failed' });
    fireEvent.click(actionButton('scale'));
    const alert = await screen.findByTestId('batch-action-error');
    expect(alert.textContent).toContain('conversation.batchJobs.errors.trialNotPassed');
    expect(alert.textContent).toContain('every trial item must pass before scaling (1 not passed)');
    // The refusal refetches, so the gate now reflects Core.
    await waitFor(() => expect(screen.getByTestId('batch-phase-trialFailed')).toBeTruthy());
    expect(actionButton('scale').disabled).toBe(true);

    // Retry with nothing left to retry → "no retryable items".
    h.api.retry.mockRejectedValueOnce(coded(409, 'BATCH_INVALID_STATE', 'no retryable items'));
    fireEvent.click(actionButton('retry-failed'));
    await waitFor(() =>
      expect(screen.getByTestId('batch-action-error').textContent).toContain(
        'conversation.batchJobs.errors.noRetryable'
      )
    );
  });

  it('cancels after confirmation and ignores other jobs’ pushes', async () => {
    seedJob('job-x', 'running', [{ status: 'passed' }, { status: 'running' }]);
    seedJob('job-y', 'running', [{ status: 'running' }]);
    renderPage('job=job-x');
    await waitFor(() => expect(screen.getByTestId('batch-phase-running')).toBeTruthy());
    const gets = h.api.get.mock.calls.length;
    push('batch.itemUpdated', { job_id: 'job-y', item_id: 'job-y-i1', status: 'passed' });
    expect(h.api.get.mock.calls.length).toBe(gets);

    fireEvent.click(actionButton('cancel'));
    fireEvent.click(await screen.findByText('conversation.batchJobs.actions.cancelConfirmOk'));
    await waitFor(() => expect(h.api.cancel).toHaveBeenCalledWith({ id: 'job-x' }));
    await waitFor(() => expect(screen.getByTestId('batch-phase-cancelled')).toBeTruthy());
  });

  it('says so when the job no longer exists', async () => {
    renderPage('job=missing');
    await waitFor(() => expect(screen.getByTestId('batch-detail-not-found')).toBeTruthy());
  });
});
