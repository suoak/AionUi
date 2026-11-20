/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { Button, Tag } from '@arco-design/web-react';
import type { TaskBoardItem } from '@/common/types/agent/taskSession';
import type { WorktreeInfo } from '@/common/types/worktree';
import { formatRelativeTime } from '@/renderer/utils/chat/relativeTime';
import { runBadgeForTask, type TaskRunBadge } from './boardModel';
import { SquadRunBadge } from './SquadRunStatus';
import { isTaskFlowItem, laneForItem, needsYouReasonForItem, planProgress } from './laneModel';

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
  /** 3.0 C2: start a To-do task that already has an assistant (task-flow Core only). */
  onStart?: (task: TaskBoardItem) => void;
};

const TaskBoardCard: React.FC<TaskBoardCardProps> = ({ task, onOpen, dragging = false, worktree = null, onStart }) => {
  const { t, i18n } = useTranslation();
  const badge = runBadgeForTask(task);
  const clickable = Boolean(onOpen);
  const reason = needsYouReasonForItem(task);
  const plan = planProgress(task);
  const queued = typeof task.queued_at === 'number';
  const canStart =
    Boolean(onStart) && isTaskFlowItem(task) && laneForItem(task) === 'todo' && Boolean(task.assistant_id) && !queued;

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
      {reason ? (
        <div
          className='self-start text-12px leading-18px px-6px rd-4px bg-[rgba(var(--warning-6),0.12)] text-[rgb(var(--warning-6))]'
          data-testid='task-board-card-needs-you'
        >
          {t(`conversation.taskBoard.needsYou.${reason}`)}
        </div>
      ) : null}
      {plan ? (
        <div className='flex flex-col gap-4px' data-testid='task-board-card-plan'>
          <div className='h-4px rd-2px bg-fill-3 overflow-hidden'>
            <div
              className='h-full bg-[rgb(var(--primary-6))]'
              style={{ width: `${Math.round((plan.done / plan.total) * 100)}%` }}
            />
          </div>
          <div className='text-12px text-t-secondary truncate'>
            {plan.current
              ? t('conversation.taskBoard.flow.planProgressStep', {
                  done: plan.done,
                  total: plan.total,
                  step: plan.current,
                })
              : t('conversation.taskBoard.flow.planProgress', { done: plan.done, total: plan.total })}
          </div>
        </div>
      ) : null}
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
        {queued ? (
          <Tag size='small' color='gray' data-testid='task-board-card-queued'>
            {t('conversation.taskBoard.flow.queuedBadge')}
          </Tag>
        ) : null}
        {task.plan_first ? (
          <Tag size='small' color='arcoblue' data-testid='task-board-card-plan-first'>
            {t('conversation.taskBoard.flow.planFirst')}
          </Tag>
        ) : null}
        {badge ? (
          <Tag size='small' color={RUN_BADGE_COLOR[badge]} data-testid='task-board-card-run-badge'>
            {t(`conversation.taskBoard.run.${badge}`)}
          </Tag>
        ) : null}
      </div>
      <div className='flex items-center justify-between gap-8px'>
        <span className='text-12px text-t-tertiary'>
          {formatRelativeTime(task.updated_at, i18n?.language ?? 'en-US')}
        </span>
        {canStart ? (
          <Button
            size='mini'
            type='primary'
            data-testid='task-board-card-start'
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onStart?.(task);
            }}
          >
            {t('conversation.taskBoard.flow.start')}
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default TaskBoardCard;
