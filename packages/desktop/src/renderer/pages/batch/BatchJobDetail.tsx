/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Message, Popconfirm, Progress, Spin, Tag, Tooltip } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { BatchItem, BatchJob, BatchRetryRequest } from '@/common/types/agent/batch';
import {
  batchActions,
  batchErrorKey,
  batchErrorReason,
  batchPhase,
  batchProgress,
  checksSummary,
  diskShortfall,
  exportFileName,
  isBatchLive,
  phaseAlertType,
  targetLabel,
} from './batchModel';

/** Safety-net refetch while a job is live, in case a push is missed. */
export const BATCH_LIVE_POLL_MS = 10_000;

const STATUS_COLOR: Record<string, string> = {
  pending: 'gray',
  running: 'arcoblue',
  passed: 'green',
  failed: 'red',
  timeout: 'orange',
  skipped: 'gray',
  cancelled: 'gray',
  draft: 'gray',
  trial: 'arcoblue',
  paused: 'orange',
  completed: 'green',
};

export const BatchStatusTag: React.FC<{ status: string; testId?: string }> = ({ status, testId }) => {
  const { t } = useTranslation();
  return (
    <Tag size='small' color={STATUS_COLOR[status] ?? 'gray'} data-testid={testId}>
      {t(`conversation.batchJobs.status.${status}`, { defaultValue: status })}
    </Tag>
  );
};

type ActionName = 'trial' | 'scale' | 'retryFailed' | 'retryItem' | 'cancel' | 'export';

type ActionError = { key: string; reason: string | null; disk: { needMiB: number; freeMiB: number } | null };

type Props = {
  jobId: string;
  /** A job-returning action succeeded; lets the list refresh its row. */
  onJobChanged?: (job: BatchJob) => void;
};

/**
 * M8 E8-5: one batch job — phase banner, actions (trial → scale, retry,
 * cancel, CSV export), progress and the item grid. Core decides every
 * transition; a refusal is shown with its localized reason and Core's
 * own message. Realtime `batch.jobUpdated` / `batch.itemUpdated` pushes
 * (and a socket reconnect) refetch the job and its items.
 */
const BatchJobDetail: React.FC<Props> = ({ jobId, onJobChanged }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [job, setJob] = useState<BatchJob | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed' | 'notFound'>('loading');
  const [busy, setBusy] = useState<ActionName | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const [nextJob, nextItems] = await Promise.all([
        ipcBridge.batch.get.invoke({ id: jobId }),
        ipcBridge.batch.items.invoke({ id: jobId }),
      ]);
      if (seq !== loadSeq.current) return;
      setJob(nextJob);
      setItems(nextItems);
      setLoadState('ready');
    } catch (error) {
      if (seq !== loadSeq.current) return;
      const key = batchErrorKey(error);
      setLoadState(key.endsWith('.notFound') ? 'notFound' : 'failed');
    }
  }, [jobId]);

  useEffect(() => {
    setJob(null);
    setItems([]);
    setActionError(null);
    setLoadState('loading');
    void load();
  }, [load]);

  useEffect(() => {
    const offJob = ipcBridge.batch.jobUpdated.on((e) => {
      if (e?.job_id === jobId) void load();
    });
    const offItem = ipcBridge.batch.itemUpdated.on((e) => {
      if (e?.job_id === jobId) void load();
    });
    const offReconnect = ipcBridge.realtime.reconnected.on(() => void load());
    return () => {
      offJob();
      offItem();
      offReconnect();
    };
  }, [jobId, load]);

  const live = job ? isBatchLive(job) : false;
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void load(), BATCH_LIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [live, load]);

  const run = async (name: ActionName, action: () => Promise<BatchJob>) => {
    setBusy(name);
    setActionError(null);
    try {
      const next = await action();
      setJob(next);
      onJobChanged?.(next);
      void load();
    } catch (error) {
      const key = batchErrorKey(error);
      setActionError({ key, reason: batchErrorReason(error), disk: diskShortfall(error) });
      Message.error(t(key));
      void load();
    } finally {
      setBusy(null);
    }
  };

  const retry = (request: BatchRetryRequest, name: ActionName) =>
    run(name, () => ipcBridge.batch.retry.invoke({ id: jobId, request }));

  const exportCsv = async () => {
    if (!job) return;
    setBusy('export');
    try {
      const csv = await ipcBridge.batch.exportCsv.invoke({ id: jobId });
      const blob = new Blob([csv ?? ''], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFileName(job);
      link.click();
      URL.revokeObjectURL(url);
      Message.success(t('conversation.batchJobs.exported'));
    } catch (error) {
      const key = batchErrorKey(error);
      setActionError({ key, reason: batchErrorReason(error), disk: null });
      Message.error(t(key));
    } finally {
      setBusy(null);
    }
  };

  if (loadState === 'loading' && !job) {
    return (
      <div className='flex-1 flex items-center justify-center py-40px'>
        <Spin />
      </div>
    );
  }
  if (loadState === 'notFound') {
    return (
      <div className='py-40px text-center text-t-secondary' data-testid='batch-detail-not-found'>
        {t('conversation.batchJobs.errors.notFound')}
      </div>
    );
  }
  if (!job) {
    return (
      <div className='py-40px flex flex-col items-center gap-12px' data-testid='batch-detail-failed'>
        <span className='text-t-secondary'>{t('conversation.batchJobs.loadFailed')}</span>
        <Button size='small' onClick={() => void load()}>
          {t('conversation.batchJobs.reload')}
        </Button>
      </div>
    );
  }

  const phase = batchPhase(job, items);
  const actions = batchActions(job, items);
  const progress = batchProgress(job, items);
  const counts = job.counts;
  const resumeLabel =
    job.status === 'paused' ? 'conversation.batchJobs.actions.resume' : 'conversation.batchJobs.actions.scale';

  return (
    <div className='flex flex-col gap-16px min-w-0' data-testid='batch-detail'>
      <div className='flex items-start justify-between gap-12px flex-wrap'>
        <div className='min-w-0'>
          <div className='flex items-center gap-8px'>
            <h2 className='m-0 text-18px font-semibold text-t-primary truncate' data-testid='batch-detail-title'>
              {job.title}
            </h2>
            <BatchStatusTag status={job.status} testId='batch-detail-status' />
          </div>
          <div className='mt-4px text-12px text-t-tertiary'>
            {t('conversation.batchJobs.meta', {
              concurrency: job.concurrency,
              minutes: Math.round(job.item_timeout_sec / 60),
              trial: job.trial_size,
            })}
          </div>
        </div>
        <div className='flex items-center gap-8px flex-wrap'>
          {actions.trial && (
            <Button
              type='primary'
              loading={busy === 'trial'}
              onClick={() => void run('trial', () => ipcBridge.batch.trial.invoke({ id: jobId }))}
              data-testid='batch-action-trial'
            >
              {t('conversation.batchJobs.actions.trial')}
            </Button>
          )}
          {(actions.scale || actions.scaleHint) && (
            <Tooltip content={actions.scaleHint ? t(actions.scaleHint) : undefined} disabled={!actions.scaleHint}>
              <span>
                <Button
                  type={actions.trial ? 'secondary' : 'primary'}
                  disabled={!actions.scale}
                  loading={busy === 'scale'}
                  onClick={() => void run('scale', () => ipcBridge.batch.scale.invoke({ id: jobId }))}
                  data-testid='batch-action-scale'
                >
                  {t(resumeLabel, { count: counts.total })}
                </Button>
              </span>
            </Tooltip>
          )}
          {actions.retryFailed && (
            <Button
              loading={busy === 'retryFailed'}
              onClick={() => void retry({ filter: 'failed' }, 'retryFailed')}
              data-testid='batch-action-retry-failed'
            >
              {t('conversation.batchJobs.actions.retryFailed')}
            </Button>
          )}
          {actions.cancel && (
            <Popconfirm
              title={t('conversation.batchJobs.cancelConfirm')}
              okText={t('conversation.batchJobs.actions.cancelConfirmOk')}
              cancelText={t('conversation.batchJobs.actions.keepRunning')}
              onOk={() => void run('cancel', () => ipcBridge.batch.cancel.invoke({ id: jobId }))}
            >
              <Button status='danger' loading={busy === 'cancel'} data-testid='batch-action-cancel'>
                {t('conversation.batchJobs.actions.cancel')}
              </Button>
            </Popconfirm>
          )}
          <Button loading={busy === 'export'} onClick={() => void exportCsv()} data-testid='batch-action-export'>
            {t('conversation.batchJobs.actions.export')}
          </Button>
        </div>
      </div>

      <Alert
        type={phaseAlertType(phase)}
        title={t(`conversation.batchJobs.phase.${phase}.title`)}
        content={t(`conversation.batchJobs.phase.${phase}.desc`, { trial: job.trial_size, total: counts.total })}
        data-testid={`batch-phase-${phase}`}
      />

      {actionError && (
        <Alert
          type='error'
          closable
          onClose={() => setActionError(null)}
          title={t(actionError.key)}
          content={
            <div className='flex flex-col gap-2px'>
              {actionError.disk && (
                <span>
                  {t('conversation.batchJobs.diskDetail', {
                    need: actionError.disk.needMiB,
                    free: actionError.disk.freeMiB,
                  })}
                </span>
              )}
              {actionError.reason && <span className='text-12px text-t-tertiary'>{actionError.reason}</span>}
            </div>
          }
          data-testid='batch-action-error'
        />
      )}

      <div className='flex flex-col gap-6px'>
        <div className='flex items-center justify-between text-12px text-t-secondary'>
          <span>
            {job.status === 'trial' || job.status === 'draft'
              ? t('conversation.batchJobs.progressTrial')
              : t('conversation.batchJobs.progressAll')}
          </span>
          <span data-testid='batch-progress-text'>
            {progress.done}/{progress.total}
          </span>
        </div>
        <Progress percent={progress.percent} showText={false} />
        <div className='flex items-center gap-12px flex-wrap text-12px text-t-secondary' data-testid='batch-counts'>
          {(['passed', 'failed', 'timeout', 'running', 'pending', 'cancelled', 'skipped'] as const).map((k) =>
            counts[k] > 0 ? (
              <span key={k} data-testid={`batch-count-${k}`}>
                {t(`conversation.batchJobs.status.${k}`)} {counts[k]}
              </span>
            ) : null
          )}
        </div>
      </div>

      <div className='overflow-x-auto rd-8px border border-solid border-[var(--color-border-2)]'>
        <table className='w-full text-13px border-collapse' data-testid='batch-items'>
          <thead>
            <tr className='text-left text-t-tertiary bg-fill-1'>
              <th className='px-10px py-8px font-normal'>#</th>
              <th className='px-10px py-8px font-normal'>{t('conversation.batchJobs.columns.target')}</th>
              <th className='px-10px py-8px font-normal'>{t('conversation.batchJobs.columns.status')}</th>
              <th className='px-10px py-8px font-normal'>{t('conversation.batchJobs.columns.checks')}</th>
              <th className='px-10px py-8px font-normal'>{t('conversation.batchJobs.columns.error')}</th>
              <th className='px-10px py-8px font-normal' />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const checks = checksSummary(item);
              return (
                <tr
                  key={item.id}
                  className='border-t border-solid border-[var(--color-border-2)] border-x-0 border-b-0'
                  data-testid={`batch-item-${item.seq}`}
                >
                  <td className='px-10px py-8px text-t-tertiary whitespace-nowrap'>{item.seq}</td>
                  <td className='px-10px py-8px max-w-280px'>
                    <div className='truncate text-t-primary' title={targetLabel(item.target)}>
                      {targetLabel(item.target)}
                    </div>
                    <div className='flex items-center gap-6px mt-2px'>
                      {item.trial && (
                        <Tag size='small' color='purple'>
                          {t('conversation.batchJobs.trialBadge')}
                        </Tag>
                      )}
                      {item.attempt > 1 && (
                        <span className='text-11px text-t-tertiary'>
                          {t('conversation.batchJobs.attempt', { count: item.attempt })}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className='px-10px py-8px whitespace-nowrap'>
                    <BatchStatusTag status={item.status} testId={`batch-item-status-${item.seq}`} />
                  </td>
                  <td className='px-10px py-8px whitespace-nowrap'>
                    {checks.total > 0 ? (
                      <Tooltip
                        content={
                          <div className='flex flex-col gap-2px'>
                            {item.check_results.map((r, i) => (
                              <span key={i}>
                                {r.ok ? '✓' : '✗'}{' '}
                                {t(`conversation.batchJobs.checkKinds.${r.kind}`, { defaultValue: r.kind })}
                                {r.detail ? ` — ${r.detail}` : ''}
                              </span>
                            ))}
                          </div>
                        }
                      >
                        <span
                          className={
                            checks.ok === checks.total ? 'text-[rgb(var(--green-6))]' : 'text-[rgb(var(--red-6))]'
                          }
                          data-testid={`batch-item-checks-${item.seq}`}
                        >
                          {checks.ok}/{checks.total}
                        </span>
                      </Tooltip>
                    ) : (
                      <span className='text-t-tertiary'>—</span>
                    )}
                  </td>
                  <td className='px-10px py-8px max-w-240px'>
                    {item.error ? (
                      <div className='truncate text-12px text-[rgb(var(--red-6))]' title={item.error}>
                        {item.error}
                      </div>
                    ) : null}
                  </td>
                  <td className='px-10px py-8px whitespace-nowrap text-right'>
                    <div className='flex items-center justify-end gap-4px'>
                      {item.task_session_id && (
                        <Button
                          size='mini'
                          type='text'
                          onClick={() => navigate(`/tasks?task=${encodeURIComponent(item.task_session_id ?? '')}`)}
                          data-testid={`batch-item-open-${item.seq}`}
                        >
                          {t('conversation.batchJobs.openSession')}
                        </Button>
                      )}
                      {actions.retryItem(item) && (
                        <Button
                          size='mini'
                          loading={busy === 'retryItem'}
                          onClick={() => void retry({ item_ids: [item.id] }, 'retryItem')}
                          data-testid={`batch-item-retry-${item.seq}`}
                        >
                          {t('conversation.batchJobs.actions.retryItem')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BatchJobDetail;
