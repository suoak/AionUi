/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import { Alert, Button, Empty, Spin, Switch } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { TaskBoardStatus, TaskSession } from '@/common/types/agent/taskSession';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import SettingsPageHeader from '@/renderer/pages/settings/components/SettingsPageHeader';
import TaskBoardCard from './TaskBoardCard';
import TaskBoardDetailDrawer from './TaskBoardDetailDrawer';
import { VISIBLE_BOARD_COLUMNS, groupTasksByBoardStatus } from './boardModel';

type LoadState = 'loading' | 'ready' | 'failed';

/**
 * M8 E6-4 skeleton: work-item board. Reads the existing task-session list and
 * places each item by `board_status` (or the D6-3 run-status mapping until
 * Core E6-2/E6-3 ship). Read-only: clicking a card opens a detail drawer; no
 * drag, assignment or review yet.
 */
const TasksBoardPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useLayoutContext()?.isMobile ?? false;
  const [tasks, setTasks] = useState<TaskSession[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [showCancelled, setShowCancelled] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadState('loading');
    ipcBridge.taskSession.list
      .invoke({})
      .then((list) => {
        setTasks(Array.isArray(list) ? list : []);
        setLoadState('ready');
      })
      .catch((error) => {
        console.error('[TasksBoard] Failed to load task sessions:', error);
        setLoadState('failed');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns = useMemo(() => groupTasksByBoardStatus(tasks), [tasks]);
  const visibleColumns: TaskBoardStatus[] = showCancelled
    ? [...VISIBLE_BOARD_COLUMNS, 'cancelled']
    : [...VISIBLE_BOARD_COLUMNS];

  // Keep the drawer bound to the latest copy of the task after a refresh.
  const selectedTask = useMemo(() => tasks.find((item) => item.id === selectedId) ?? null, [tasks, selectedId]);

  const handleSelect = useCallback((task: TaskSession) => setSelectedId(task.id), []);

  const handleOpenConversation = useCallback(
    (conversationId: string) => {
      setSelectedId(null);
      navigate(`/conversation/${conversationId}`);
    },
    [navigate]
  );

  return (
    <div className='w-full h-full min-h-0 box-border bg-1 flex flex-col overflow-hidden' data-testid='tasks-board-page'>
      <div className={classNames('shrink-0 bg-1', isMobile ? 'px-16px pt-14px pb-10px' : 'px-40px pt-32px pb-12px')}>
        <SettingsPageHeader
          sticky={false}
          title={t('conversation.taskBoard.title')}
          description={t('conversation.taskBoard.description')}
          actions={
            <div className='flex items-center gap-12px'>
              <label className='flex items-center gap-6px text-13px text-t-secondary cursor-pointer'>
                <Switch
                  size='small'
                  checked={showCancelled}
                  onChange={setShowCancelled}
                  data-testid='tasks-board-show-cancelled'
                />
                {t('conversation.taskBoard.showCancelled')}
              </label>
              <Button size='small' onClick={load} loading={loadState === 'loading'}>
                {t('conversation.taskBoard.refresh')}
              </Button>
            </div>
          }
        />
        <Alert className='mt-12px' type='info' showIcon content={t('conversation.taskBoard.previewNotice')} />
      </div>

      {loadState === 'failed' ? (
        <div className='flex-1 flex flex-col items-center justify-center gap-12px' data-testid='tasks-board-failed'>
          <span className='text-t-secondary'>{t('conversation.taskBoard.loadFailed')}</span>
          <Button type='primary' onClick={load}>
            {t('conversation.taskBoard.retry')}
          </Button>
        </div>
      ) : loadState === 'loading' && tasks.length === 0 ? (
        <div className='flex-1 flex items-center justify-center'>
          <Spin />
        </div>
      ) : (
        <div
          className={classNames(
            'flex-1 min-h-0 flex gap-12px overflow-x-auto overflow-y-hidden box-border',
            isMobile ? 'px-16px pb-16px' : 'px-40px pb-24px'
          )}
        >
          {visibleColumns.map((status) => (
            <section
              key={status}
              data-testid={`tasks-board-column-${status}`}
              className='shrink-0 w-260px min-h-0 flex flex-col rd-10px bg-fill-1 box-border'
            >
              <header className='shrink-0 flex items-center justify-between px-12px pt-10px pb-8px'>
                <span className='text-13px font-medium text-t-primary'>
                  {t(`conversation.taskBoard.columns.${status}`)}
                </span>
                <span className='text-12px text-t-tertiary' data-testid={`tasks-board-column-count-${status}`}>
                  {columns[status].length}
                </span>
              </header>
              <div className='flex-1 min-h-0 overflow-y-auto px-8px pb-8px flex flex-col gap-8px'>
                {columns[status].length === 0 ? (
                  <Empty className='py-16px' description={t('conversation.taskBoard.emptyColumn')} />
                ) : (
                  columns[status].map((task) => <TaskBoardCard key={task.id} task={task} onOpen={handleSelect} />)
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      <TaskBoardDetailDrawer
        task={selectedTask}
        isMobile={isMobile}
        onClose={() => setSelectedId(null)}
        onOpenConversation={handleOpenConversation}
      />
    </div>
  );
};

export default TasksBoardPage;
