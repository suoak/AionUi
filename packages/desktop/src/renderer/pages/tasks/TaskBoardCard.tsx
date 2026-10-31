/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { Tag } from '@arco-design/web-react';
import type { TaskBoardItem } from '@/common/types/agent/taskSession';
import type { WorktreeInfo } from '@/common/types/worktree';
import { formatRelativeTime } from '@/renderer/utils/chat/relativeTime';
import { runBadgeForTask, type TaskRunBadge } from './boardModel';
import { SquadRunBadge } from './SquadRunStatus';

const RUN_BADGE_COLOR: Record<TaskRunBadge, string> = {
  running: 'arcoblue',
  blocked: 'orangered',
  paused: 'gray',
  failed: 'red',
};

const PRIORITY_COLOR: Record<number, string> = { 1: 'gray', 2: 'gold', 3: 'orange', 4: 'red' };
const PRIORITY_KEYS = ['none', 'low', 'medium', 'high', 'urgent'] as const;

type TaskBoardCardProps = {
  task: TaskBoardItem;
  onOpen?: (task: TaskBoardItem) => void;
  /** Visual state while the card is being dragged. */
  dragging?: boolean;
  /** M8 Q12: the work item's shared worktree, if any. */
  worktree?: WorktreeInfo | null;
};

const TaskBoardCard: React.FC<TaskBoardCardProps> = ({ task, onOpen, dragging = false, worktree = null }) => {
  const { t, i18n } = useTranslation();
  const badge = runBadgeForTask(task);
  const clickable = Boolean(onOpen);

  return (
    <div
      data-testid={`task-board-card-${task.id}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={classNames(
        'box-border w-full rd-8px border border-solid border-[var(--color-border-2)] bg-2 p-10px flex flex-col gap-6px',
        clickable && 'cursor-pointer hover:bg-fill-2',
        dragging && 'opacity-50'
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
      <div className='text-14px text-t-primary font-medium break-words line-clamp-2'>{task.title || task.id}</div>
      <div className='flex flex-wrap items-center gap-4px'>
        <Tag size='small'>{t(`conversation.taskBoard.mode.${task.mode}`)}</Tag>
        {task.priority > 0 && task.priority < PRIORITY_KEYS.length ? (
          <Tag size='small' color={PRIORITY_COLOR[task.priority]} data-testid='task-board-card-priority'>
            {t(`conversation.taskBoard.priority.${PRIORITY_KEYS[task.priority]}`)}
          </Tag>
        ) : null}
        {task.assignee ? (
          <Tag size='small' data-testid='task-board-card-assignee'>
            {t(`conversation.taskBoard.assignee.kind.${task.assignee.kind}`)}: {task.assignee.id}
          </Tag>
        ) : null}
        {task.assignee?.kind === 'squad' && task.assignee.id ? (
          <SquadRunBadge templateId={task.assignee.id} run={task.squad_run} />
        ) : null}
        {worktree?.branch ? (
          <Tag
            size='small'
            color='cyan'
            title={worktree.path}
            data-testid='task-board-card-worktree'
            className='max-w-full'
          >
            <span className='font-mono break-all'>{worktree.branch}</span>
          </Tag>
        ) : null}
        {task.labels.map((label) => (
          <Tag key={label} size='small' color='purple'>
            {label}
          </Tag>
        ))}
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
