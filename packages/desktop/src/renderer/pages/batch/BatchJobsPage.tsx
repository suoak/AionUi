/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import classNames from 'classnames';
import { Button, Empty, Spin } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { BatchJob } from '@/common/types/agent/batch';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import SettingsPageHeader from '@/renderer/pages/settings/components/SettingsPageHeader';
import BatchCreateDrawer from './BatchCreateDrawer';
import BatchJobDetail, { BatchStatusTag } from './BatchJobDetail';
import { batchErrorKey } from './batchModel';

const LIST_LIMIT = 100;

/**
 * M8 E8-5: batch jobs (demo ②). Left: job list; right: the selected job
 * (`?job=<id>`). New jobs start as drafts; the trial → scale gate, retries,
 * cancel and CSV export live in the detail. `batch.jobUpdated` pushes keep
 * list rows fresh.
 */
const BatchJobsPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('job');
  const isMobile = useLayoutContext()?.isMobile ?? false;
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const list = await ipcBridge.batch.list.invoke({ limit: LIST_LIMIT });
      if (seq !== loadSeq.current) return;
      setJobs(list ?? []);
      setLoadState('ready');
      setLoadError(null);
    } catch (error) {
      if (seq !== loadSeq.current) return;
      setLoadError(batchErrorKey(error));
      setLoadState('failed');
    }
  }, []);

  useEffect(() => {
    void load();
    const offJob = ipcBridge.batch.jobUpdated.on(() => void load());
    const offReconnect = ipcBridge.realtime.reconnected.on(() => void load());
    return () => {
      offJob();
      offReconnect();
    };
  }, [load]);

  const select = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('job', id);
    else next.delete('job');
    setSearchParams(next);
  };

  const upsert = (job: BatchJob) =>
    setJobs((list) =>
      list.some((j) => j.id === job.id) ? list.map((j) => (j.id === job.id ? job : j)) : [job, ...list]
    );

  const showList = !isMobile || !selectedId;
  const showDetail = !isMobile || !!selectedId;

  return (
    <div className='w-full h-full min-h-0 box-border bg-1 flex flex-col overflow-hidden' data-testid='batch-page'>
      <div className={classNames('shrink-0 bg-1', isMobile ? 'px-16px pt-14px pb-10px' : 'px-40px pt-32px pb-12px')}>
        <SettingsPageHeader
          title={t('conversation.batchJobs.title')}
          description={t('conversation.batchJobs.description')}
          actions={
            <Button type='primary' onClick={() => setCreating(true)} data-testid='batch-new'>
              {t('conversation.batchJobs.newJob')}
            </Button>
          }
        />
      </div>
      <div className={classNames('flex-1 min-h-0 flex gap-16px', isMobile ? 'px-16px pb-16px' : 'px-40px pb-24px')}>
        {showList && (
          <aside
            className={classNames(
              'min-h-0 overflow-y-auto flex flex-col gap-8px',
              isMobile ? 'w-full' : 'w-280px shrink-0'
            )}
            data-testid='batch-list'
          >
            {loadState === 'loading' && jobs.length === 0 ? (
              <div className='py-24px flex justify-center'>
                <Spin />
              </div>
            ) : loadState === 'failed' && jobs.length === 0 ? (
              <div className='py-24px flex flex-col items-center gap-8px' data-testid='batch-list-failed'>
                <span className='text-t-secondary text-13px text-center'>
                  {t(loadError ?? 'conversation.batchJobs.loadFailed')}
                </span>
                <Button size='small' onClick={() => void load()}>
                  {t('conversation.batchJobs.reload')}
                </Button>
              </div>
            ) : jobs.length === 0 ? (
              <Empty className='py-24px' description={t('conversation.batchJobs.empty')} />
            ) : (
              jobs.map((job) => (
                <button
                  key={job.id}
                  type='button'
                  onClick={() => select(job.id)}
                  className={classNames(
                    'text-left w-full p-10px rd-8px border border-solid cursor-pointer bg-transparent',
                    job.id === selectedId
                      ? 'border-[rgb(var(--primary-6))] bg-fill-2'
                      : 'border-[var(--color-border-2)] hover:bg-fill-1'
                  )}
                  data-testid={`batch-list-item-${job.id}`}
                >
                  <div className='flex items-center justify-between gap-8px'>
                    <span className='truncate text-13px font-medium text-t-primary'>{job.title}</span>
                    <BatchStatusTag status={job.status} />
                  </div>
                  <div className='mt-4px text-12px text-t-tertiary'>
                    {t('conversation.batchJobs.listSummary', {
                      passed: job.counts.passed,
                      total: job.counts.total,
                      failed: job.counts.failed + job.counts.timeout,
                    })}
                  </div>
                </button>
              ))
            )}
          </aside>
        )}
        {showDetail && (
          <main className='flex-1 min-w-0 min-h-0 overflow-y-auto'>
            {isMobile && selectedId && (
              <Button size='small' type='text' className='mb-8px' onClick={() => select(null)}>
                {t('conversation.batchJobs.back')}
              </Button>
            )}
            {selectedId ? (
              <BatchJobDetail key={selectedId} jobId={selectedId} onJobChanged={upsert} />
            ) : (
              <Empty className='py-40px' description={t('conversation.batchJobs.selectHint')} />
            )}
          </main>
        )}
      </div>
      <BatchCreateDrawer
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(job) => {
          setCreating(false);
          upsert(job);
          select(job.id);
        }}
      />
    </div>
  );
};

export default BatchJobsPage;
