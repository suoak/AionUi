/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Descriptions, Drawer, Tag } from '@arco-design/web-react';
import type { TaskSession } from '@/common/types/agent/taskSession';
import { boardStatusForTask } from './boardModel';

type TaskBoardDetailDrawerProps = {
  task: TaskSession | null;
  isMobile?: boolean;
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
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
 * M8 E6-4: read-only detail of one board card. Shows the fields the existing
 * task-session payload already carries; editing (move / assign / comment)
 * waits for the Core E6-3 HTTP endpoints.
 */
const TaskBoardDetailDrawer: React.FC<TaskBoardDetailDrawerProps> = ({
  task,
  isMobile = false,
  onClose,
  onOpenConversation,
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language ?? 'en-US';
  const conversationId = task?.conversation_id;

  const data = task
    ? [
        {
          label: t('conversation.taskBoard.detail.boardColumn'),
          value: t(`conversation.taskBoard.columns.${boardStatusForTask(task)}`),
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
        { label: t('conversation.taskBoard.detail.agent'), value: task.agent_type || '—' },
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
      width={isMobile ? '100%' : 420}
      title={task ? task.title || task.objective || task.id : ''}
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
          <section>
            <div className='text-13px font-medium text-t-primary mb-6px'>
              {t('conversation.taskBoard.detail.objective')}
            </div>
            <div
              className='text-13px text-t-secondary whitespace-pre-wrap break-words'
              data-testid='task-board-detail-objective'
            >
              {task.objective || t('conversation.taskBoard.detail.none')}
            </div>
          </section>
          <section>
            <div className='text-13px font-medium text-t-primary mb-6px'>
              {t('conversation.taskBoard.detail.acceptanceCriteria')}
            </div>
            {task.acceptance_criteria.length > 0 ? (
              <ul
                className='m-0 ps-18px text-13px text-t-secondary flex flex-col gap-4px'
                data-testid='task-board-detail-criteria'
              >
                {task.acceptance_criteria.map((criterion, index) => (
                  <li key={index} className='break-words'>
                    {criterion}
                  </li>
                ))}
              </ul>
            ) : (
              <div className='text-13px text-t-secondary'>{t('conversation.taskBoard.detail.none')}</div>
            )}
          </section>
        </div>
      ) : null}
    </Drawer>
  );
};

export default TaskBoardDetailDrawer;
