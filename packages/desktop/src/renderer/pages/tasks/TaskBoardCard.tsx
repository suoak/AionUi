/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { Tag } from '@arco-design/web-react';
import type { TaskSession } from '@/common/types/agent/taskSession';
import { formatRelativeTime } from '@/renderer/utils/chat/relativeTime';
import { runBadgeForTask, type TaskRunBadge } from './boardModel';

const RUN_BADGE_COLOR: Record<TaskRunBadge, string> = {
  running: 'arcoblue',
  blocked: 'orangered',
  paused: 'gray',
  failed: 'red',
};

type TaskBoardCardProps = {
  task: TaskSession;
  onOpen?: (task: TaskSession) => void;
};

const TaskBoardCard: React.FC<TaskBoardCardProps> = ({ task, onOpen }) => {
  const { t, i18n } = useTranslation();
  const badge = runBadgeForTask(task);
  const clickable = Boolean(task.conversation_id && onOpen);

  return (
    <div
      data-testid={`task-board-card-${task.id}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? undefined : t('conversation.taskBoard.noConversation')}
      className={classNames(
        'box-border w-full rd-8px border border-solid border-[var(--color-border-2)] bg-2 p-10px flex flex-col gap-6px',
        clickable && 'cursor-pointer hover:bg-fill-2'
      )}
      onClick={clickable ? () => onOpen?.(task) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen?.(task);
              }
            }
          : undefined
      }
    >
      <div className='text-14px text-t-primary font-medium break-words line-clamp-2'>
        {task.title || task.objective || task.id}
      </div>
      <div className='flex flex-wrap items-center gap-4px'>
        <Tag size='small'>{t(`conversation.taskBoard.mode.${task.mode}`)}</Tag>
        {task.agent_type ? (
          <Tag size='small' data-testid='task-board-card-agent'>
            {task.agent_type}
          </Tag>
        ) : null}
        {badge ? (
          <Tag size='small' color={RUN_BADGE_COLOR[badge]} data-testid='task-board-card-run-badge'>
            {t(`conversation.taskBoard.run.${badge}`)}
          </Tag>
        ) : null}
      </div>
      <div className='text-12px text-t-tertiary'>{formatRelativeTime(task.updated_at, i18n?.language ?? 'en-US')}</div>
    </div>
  );
};

export default TaskBoardCard;
