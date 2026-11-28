/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TaskBoardItem, TaskSession } from '@/common/types/agent/taskSession';
import { columnsFromBoardResponse } from '@/renderer/pages/tasks/boardModel';
import { laneForItem, needsYouReasonForItem, planProgress } from '@/renderer/pages/tasks/laneModel';
import { Tooltip } from '@arco-design/web-react';
import { ListCheckbox } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

const REFRESH_DEBOUNCE_MS = 800;

/** The board row for one task (lane, plan progress), kept fresh on board pushes. */
export const useTaskBoardItem = (taskId: string | undefined): TaskBoardItem | null => {
  const [item, setItem] = useState<TaskBoardItem | null>(null);
  useEffect(() => {
    setItem(null);
    const board = ipcBridge.taskSession?.board;
    if (!taskId || !board?.get) return undefined;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () =>
      board.get
        .invoke({})
        .then((response) => {
          if (disposed) return;
          const columns = columnsFromBoardResponse(response);
          const found = Object.values(columns)
            .flat()
            .find((row) => row.id === taskId);
          setItem(found ?? null);
        })
        .catch(() => {
          // Older cores have no board: the pill falls back to the session status.
        });
    void load();
    const off = board.updated?.on?.(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), REFRESH_DEBOUNCE_MS);
    });
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (typeof off === 'function') off();
    };
  }, [taskId]);
  return item;
};

/**
 * 3.0 U5: the task this conversation runs for — lane (or status), the plan
 * bar that stays after the turn ends, and a link to the task's detail.
 */
const ConversationTaskPill: React.FC<{ task: TaskSession }> = ({ task }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const item = useTaskBoardItem(task.id);
  const plan = item ? planProgress(item) : null;
  const lane = item ? laneForItem(item) : null;
  const reason = item ? needsYouReasonForItem(item) : null;
  const stateLabel = lane
    ? t(`conversation.taskBoard.lanes.${lane}`) + (reason ? ` · ${t(`conversation.taskBoard.needsYou.${reason}`)}` : '')
    : t(`conversation.taskSession.status.${task.status}`);
  return (
    <Tooltip content={t('conversation.taskBoard.conversationTask.open')}>
      <button
        type='button'
        data-testid='conversation-task-pill'
        data-lane={lane ?? undefined}
        className={classNames(
          'shrink-0 max-w-260px flex items-center gap-6px h-24px px-8px rd-12px border border-solid cursor-pointer text-12px',
          lane === 'needs_you'
            ? 'bg-[rgba(var(--warning-6),0.10)] border-[rgba(var(--warning-6),0.35)] text-[rgb(var(--warning-6))]'
            : 'bg-fill-1 border-[var(--color-border-2)] text-t-secondary'
        )}
        onClick={() => navigate(`/tasks?task=${encodeURIComponent(task.id)}`)}
      >
        <ListCheckbox theme='outline' size='12' />
        <span className='truncate'>{stateLabel}</span>
        {plan ? (
          <span className='shrink-0 flex items-center gap-4px' data-testid='conversation-task-plan'>
            <span className='w-40px h-4px rd-2px bg-fill-3 overflow-hidden inline-block'>
              <span
                className='block h-full bg-[rgb(var(--primary-6))]'
                style={{ width: `${Math.round((plan.done / plan.total) * 100)}%` }}
              />
            </span>
            <span className='tabular-nums'>
              {plan.done}/{plan.total}
            </span>
          </span>
        ) : null}
      </button>
    </Tooltip>
  );
};

export default ConversationTaskPill;
