/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Descriptions, Drawer, Select, Tag } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { TaskBoardItem, TaskBoardStatus, TaskSession } from '@/common/types/agent/taskSession';
import TaskBoardAssigneeEditor from './TaskBoardAssigneeEditor';
import TaskBoardReviewPanel from './TaskBoardReviewPanel';
import TaskBoardTimeline from './TaskBoardTimeline';
import { userMoveTargets } from './boardModel';

const PRIORITY_KEYS = ['none', 'low', 'medium', 'high', 'urgent'] as const;

type TaskBoardDetailDrawerProps = {
  task: TaskBoardItem | null;
  /** False on cores without the board API: details only, no editing. */
  interactive?: boolean;
  /** Bumped after board mutations so the timeline refetches. */
  refreshKey?: number;
  isMobile?: boolean;
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
  onMove?: (task: TaskBoardItem, to: TaskBoardStatus) => void;
  onItemUpdated?: (task: TaskBoardItem) => void;
  /** A board PATCH hit the optimistic lock (409 `board_item_stale`). */
  onStale?: () => void;
};

const formatTimestamp = (ms: number, locale: string): string => {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  try {
    return new Date(ms).toLocaleString(locale);
  } catch {
    return new Date(ms).toISOString();
  }
};

/**
 * M8 E6-4: detail of one board card — fields, column move, review gate,
 * assignee and the comment/event timeline. Objective and acceptance criteria
 * come from the task session itself.
 */
const TaskBoardDetailDrawer: React.FC<TaskBoardDetailDrawerProps> = ({
  task,
  interactive = false,
  refreshKey = 0,
  isMobile = false,
  onClose,
  onOpenConversation,
  onMove,
  onItemUpdated,
  onStale,
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language ?? 'en-US';
  const conversationId = task?.conversation_id;
  const taskId = task?.id ?? null;
  const [session, setSession] = useState<TaskSession | null>(null);

  useEffect(() => {
    setSession(null);
    if (!taskId) return;
    let cancelled = false;
    ipcBridge.taskSession.get
      .invoke({ id: taskId })
      .then((loaded) => {
        if (!cancelled) setSession(loaded ?? null);
      })
      .catch((error) => console.error('[TasksBoard] Failed to load task session:', error));
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const moveTargets = task ? userMoveTargets(task.board_status) : [];

  const data = task
    ? [
        {
          label: t('conversation.taskBoard.detail.boardColumn'),
          value: t(`conversation.taskBoard.columns.${task.board_status}`),
        },
        {
          label: t('conversation.taskBoard.detail.runStatus'),
          value: (
            <span data-testid='task-board-detail-run-status'>
              {t(`conversation.taskSession.status.${task.status}`)}
            </span>
          ),
        },
        {
          label: t('conversation.taskBoard.detail.mode'),
          value: <Tag size='small'>{t(`conversation.taskBoard.mode.${task.mode}`)}</Tag>,
        },
        {
          label: t('conversation.taskBoard.detail.priority'),
          value: t(`conversation.taskBoard.priority.${PRIORITY_KEYS[task.priority] ?? 'none'}`),
        },
        {
          label: t('conversation.taskBoard.detail.assignee'),
          value: task.assignee
            ? `${t(`conversation.taskBoard.assignee.kind.${task.assignee.kind}`)}: ${task.assignee.id}`
            : t('conversation.taskBoard.assignee.none'),
        },
        {
          label: t('conversation.taskBoard.detail.labels'),
          value:
            task.labels.length > 0 ? (
              <span className='flex flex-wrap gap-4px'>
                {task.labels.map((label) => (
                  <Tag key={label} size='small' color='purple'>
                    {label}
                  </Tag>
                ))}
              </span>
            ) : (
              '—'
            ),
        },
        { label: t('conversation.taskBoard.detail.agent'), value: session?.agent_type || '—' },
        { label: t('conversation.taskBoard.detail.createdAt'), value: formatTimestamp(task.created_at, locale) },
        { label: t('conversation.taskBoard.detail.updatedAt'), value: formatTimestamp(task.updated_at, locale) },
        {
          label: t('conversation.taskBoard.detail.taskId'),
          value: <span className='break-all font-mono text-12px'>{task.id}</span>,
        },
      ]
    : [];

  return (
    <Drawer
      visible={Boolean(task)}
      width={isMobile ? '100%' : 460}
      title={task ? task.title || task.id : ''}
      onCancel={onClose}
      unmountOnExit
      footer={
        <div className='flex items-center justify-between gap-8px'>
          <span className='text-12px text-t-tertiary'>
            {conversationId ? null : t('conversation.taskBoard.noConversation')}
          </span>
          <Button
            type='primary'
            disabled={!conversationId}
            data-testid='task-board-detail-open-conversation'
            onClick={() => {
              if (conversationId) onOpenConversation(conversationId);
            }}
          >
            {t('conversation.taskBoard.detail.openConversation')}
          </Button>
        </div>
      }
    >
      {task ? (
        <div className='flex flex-col gap-16px' data-testid='task-board-detail'>
          <Descriptions column={1} data={data} labelStyle={{ whiteSpace: 'nowrap' }} />
          {interactive && task.board_status === 'in_review' ? (
            <TaskBoardReviewPanel item={task} onReviewed={(item) => onItemUpdated?.(item)} />
          ) : null}
          {interactive && moveTargets.length > 0 ? (
            <section className='flex flex-col gap-6px'>
              <div className='text-13px font-medium text-t-primary'>{t('conversation.taskBoard.move.title')}</div>
              <Select
                key={task.board_status}
                size='small'
                value={undefined}
                placeholder={t('conversation.taskBoard.move.placeholder')}
                onChange={(to: TaskBoardStatus) => onMove?.(task, to)}
                data-testid='task-board-detail-move'
              >
                {moveTargets.map((status) => (
                  <Select.Option key={status} value={status}>
                    {t(`conversation.taskBoard.columns.${status}`)}
                  </Select.Option>
                ))}
              </Select>
            </section>
          ) : null}
          {interactive ? (
            <TaskBoardAssigneeEditor
              item={task}
              onUpdated={(item) => onItemUpdated?.(item)}
              onStale={() => onStale?.()}
            />
          ) : null}
          <section>
            <div className='text-13px font-medium text-t-primary mb-6px'>
              {t('conversation.taskBoard.detail.objective')}
            </div>
            <div
              className='text-13px text-t-secondary whitespace-pre-wrap break-words'
              data-testid='task-board-detail-objective'
            >
              {session?.objective || t('conversation.taskBoard.detail.none')}
            </div>
          </section>
          <section>
            <div className='text-13px font-medium text-t-primary mb-6px'>
              {t('conversation.taskBoard.detail.acceptanceCriteria')}
            </div>
            {session && session.acceptance_criteria.length > 0 ? (
              <ul
                className='m-0 ps-18px text-13px text-t-secondary flex flex-col gap-4px'
                data-testid='task-board-detail-criteria'
              >
                {session.acceptance_criteria.map((criterion, index) => (
                  <li key={index} className='break-words'>
                    {criterion}
                  </li>
                ))}
              </ul>
            ) : (
              <div className='text-13px text-t-secondary'>{t('conversation.taskBoard.detail.none')}</div>
            )}
          </section>
          {interactive ? <TaskBoardTimeline taskId={task.id} refreshKey={refreshKey} /> : null}
        </div>
      ) : null}
    </Drawer>
  );
};

export default TaskBoardDetailDrawer;
