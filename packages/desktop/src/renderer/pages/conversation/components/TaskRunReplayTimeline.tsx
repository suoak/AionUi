/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TaskRunReplayPage, TaskTraceEvent } from '@/common/types/agent/taskSession';
import { Alert, Button, Empty, Space, Spin, Tag, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { emptyReplay, isErrorEvent, mergeReplayPage, missingBefore, type ReplayState } from './taskRunReplayModel';

export const REPLAY_PAGE_SIZE = 200;

type Props = { taskId: string; runId: string; firstPage: TaskRunReplayPage };

const eventColor = (event: TaskTraceEvent) => {
  if (isErrorEvent(event)) return 'red';
  if (event.event_type.endsWith('.completed') || event.event_type.endsWith('.allowed')) return 'green';
  if (event.event_type.startsWith('file.')) return 'arcoblue';
  return undefined;
};

/**
 * First replay page for a run, or `undefined` while loading / when the core
 * has no replay endpoint (older aioncore answers 404): callers hide the entry.
 */
export function useFirstReplayPage(taskId: string, runId: string | undefined, enabled: boolean) {
  const [page, setPage] = useState<{ key: string; page: TaskRunReplayPage | null }>();
  const key = `${taskId}|${runId ?? ''}`;
  useEffect(() => {
    if (!enabled || !runId) return;
    let cancelled = false;
    Promise.resolve()
      .then(() =>
        ipcBridge.taskSession.run.replay.invoke({
          id: taskId,
          run_id: runId,
          after_sequence: 0,
          limit: REPLAY_PAGE_SIZE,
        })
      )
      .then(
        (result) => !cancelled && setPage({ key, page: result }),
        () => !cancelled && setPage({ key, page: null })
      );
    return () => {
      cancelled = true;
    };
  }, [taskId, runId, enabled, key]);
  return page?.key === key ? (page.page ?? undefined) : undefined;
}

/** Run replay timeline (M7 E5-6): cursor-paged trace with retention gaps. */
const TaskRunReplayTimeline: React.FC<Props> = ({ taskId, runId, firstPage }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<ReplayState>(() => mergeReplayPage(emptyReplay, firstPage));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<number>();

  useEffect(() => {
    setState(mergeReplayPage(emptyReplay, firstPage));
    setSelected(undefined);
  }, [firstPage]);

  const loadMore = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const page = await ipcBridge.taskSession.run.replay.invoke({
        id: taskId,
        run_id: runId,
        after_sequence: state.cursor,
        limit: REPLAY_PAGE_SIZE,
      });
      setState((current) => mergeReplayPage(current, page));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [taskId, runId, state.cursor]);

  const firstError = useMemo(() => state.events.find(isErrorEvent)?.sequence, [state.events]);
  const selectedEvent = state.events.find((event) => event.sequence === selected);

  return (
    <Space direction='vertical' className='w-full' data-task-run-replay>
      {state.retentionGap ? (
        <Alert type='warning' data-replay-retention-gap content={t('conversation.taskSession.replay.retentionGap')} />
      ) : null}
      <Space>
        <Typography.Text type='secondary'>
          {t('conversation.taskSession.replay.progress', { loaded: state.events.length, latest: state.latestSequence })}
        </Typography.Text>
        {firstError !== undefined ? (
          <Button size='mini' data-replay-first-error onClick={() => setSelected(firstError)}>
            {t('conversation.taskSession.replay.jumpToError')}
          </Button>
        ) : null}
      </Space>
      {state.events.length === 0 ? <Empty description={t('conversation.taskSession.replay.empty')} /> : null}
      <div className='flex w-full gap-12px'>
        <div className='flex max-h-420px min-w-0 flex-1 flex-col gap-2px overflow-auto'>
          {state.events.map((event, index) => {
            const missing = missingBefore(state.events, index);
            return (
              <React.Fragment key={event.event_id}>
                {missing > 0 ? (
                  <Typography.Text type='secondary' className='px-8px text-11px' data-replay-gap>
                    {t('conversation.taskSession.replay.removed', { count: missing })}
                  </Typography.Text>
                ) : null}
                <Button
                  type={selected === event.sequence ? 'secondary' : 'text'}
                  size='mini'
                  data-replay-event={event.sequence}
                  className='!flex !h-auto !items-center !justify-start !gap-8px !text-left'
                  onClick={() => setSelected(event.sequence)}
                >
                  <span className='w-40px shrink-0 text-right text-11px text-t-tertiary'>{event.sequence}</span>
                  <Tag size='small' color={eventColor(event)}>
                    {event.event_type}
                  </Tag>
                  <span className='truncate text-11px text-t-secondary'>
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </Button>
              </React.Fragment>
            );
          })}
          {state.hasMore ? (
            <Button size='mini' loading={loading} data-replay-load-more onClick={() => void loadMore()}>
              {t('conversation.taskSession.replay.loadMore')}
            </Button>
          ) : null}
          {loadError ? <Alert type='error' content={t('conversation.taskSession.review.loadFailed')} /> : null}
          {loading && state.events.length === 0 ? <Spin /> : null}
        </div>
        <div className='w-360px shrink-0'>
          {selectedEvent ? (
            <Typography.Paragraph code className='max-h-420px overflow-auto whitespace-pre-wrap text-11px'>
              {JSON.stringify(selectedEvent.payload, null, 2)}
            </Typography.Paragraph>
          ) : (
            <Typography.Text type='secondary'>{t('conversation.taskSession.replay.selectHint')}</Typography.Text>
          )}
        </div>
      </div>
    </Space>
  );
};

export default TaskRunReplayTimeline;
