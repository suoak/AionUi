/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Descriptions, Select, Tabs, Tag } from '@arco-design/web-react';
import { Left } from '@icon-park/react';
import classNames from 'classnames';
import { ipcBridge } from '@/common';
import type { TaskBoardItem, TaskBoardStatus, TaskSession } from '@/common/types/agent/taskSession';
import type { WorktreeInfo } from '@/common/types/worktree';
import TaskBoardAssigneeEditor from './TaskBoardAssigneeEditor';
import TaskBoardSquadStart from './TaskBoardSquadStart';
import TaskBoardTimeline from './TaskBoardTimeline';
import TaskBoardWorktreePanel from './TaskBoardWorktreePanel';
import { SquadRunPanel } from './SquadRunStatus';
import { userMoveTargets } from './boardModel';
import { canStartSquadForItem } from './workItemWorktreeModel';
import TaskReviewTab from './TaskReviewTab';
import { laneForItem, needsYouReasonForItem, planProgress } from './laneModel';
import { parseDelivery, type TaskDetailTab } from './taskDetailModel';

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
  /** M8 Q12: the work item's shared worktree, if any. */
  worktree?: WorktreeInfo | null;
  /** A Squad instance was started for this work item. */
  onSquadStarted?: () => void;
};

const formatTimestamp = (ms: number, locale: string): string => {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  try {
    return new Date(ms).toLocaleString(locale);
  } catch {
    return new Date(ms).toISOString();
  }
};

/** Tab a task opens on: Review when it waits for a review or has a conflict. */
const initialTab = (task: TaskBoardItem | null): TaskDetailTab => {
  if (!task) return 'overview';
  const reason = needsYouReasonForItem(task);
  if (task.board_status === 'in_review' || reason === 'review' || reason === 'merge_conflict') return 'review';
  return 'overview';
};

/**
 * Detail of one task (3.0 U3: a full-width page over the board, not a drawer).
 * Main area tabs Overview / Conversation / Review / Activity, properties on
 * the side. M8 E6-4 fields, column move, review gate, assignee and timeline
 * keep their places; objective and acceptance criteria come from the session.
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
  worktree = null,
  onSquadStarted,
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language ?? 'en-US';
  const conversationId = task?.conversation_id;
  const taskId = task?.id ?? null;
  const [session, setSession] = useState<TaskSession | null>(null);
  const [tab, setTab] = useState<TaskDetailTab>(() => initialTab(task));

  useEffect(() => {
    setTab(initialTab(task));
    // Only when another task opens; live updates of the same task keep the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

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
  const delivery = parseDelivery(task);

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
        ...(task.lane
          ? [
              {
                label: t('conversation.taskBoard.detail3.lane'),
                value: (
                  <span data-testid='task-detail-lane'>
                    {t(`conversation.taskBoard.lanes.${laneForItem(task)}`)}
                    {needsYouReasonForItem(task)
                      ? ` · ${t(`conversation.taskBoard.needsYou.${needsYouReasonForItem(task)}`)}`
                      : ''}
                  </span>
                ),
              },
              {
                label: t('conversation.taskBoard.detail3.source'),
                value: t(`conversation.taskBoard.detail3.sources.${task.source ?? 'manual'}`),
              },
              { label: t('conversation.taskBoard.newTask.assistant'), value: task.assistant_id || '—' },
              ...(planProgress(task)
                ? [
                    {
                      label: t('conversation.taskBoard.detail3.plan'),
                      value: t('conversation.taskBoard.flow.planProgress', planProgress(task)!),
                    },
                  ]
                : []),
              ...(worktree?.branch
                ? [
                    {
                      label: t('conversation.taskBoard.detail3.branch'),
                      value: <span className='font-mono text-12px break-all'>{worktree.branch}</span>,
                    },
                  ]
                : []),
              ...(delivery.pull_request
                ? [
                    {
                      label: t('conversation.taskBoard.detail3.pullRequest'),
                      value: (
                        <a
                          href={delivery.pull_request.url}
                          target='_blank'
                          rel='noreferrer'
                          className='text-[rgb(var(--primary-6))] break-all'
                        >
                          {delivery.pull_request.number
                            ? `#${delivery.pull_request.number}`
                            : delivery.pull_request.url}
                        </a>
                      ),
                    },
                  ]
                : []),
            ]
          : []),
        { label: t('conversation.taskBoard.detail.createdAt'), value: formatTimestamp(task.created_at, locale) },
        { label: t('conversation.taskBoard.detail.updatedAt'), value: formatTimestamp(task.updated_at, locale) },
        {
          label: t('conversation.taskBoard.detail.taskId'),
          value: <span className='break-all font-mono text-12px'>{task.id}</span>,
        },
      ]
    : [];

  if (!task) return null;

  const openConversationButton = (testId: string) => (
    <Button
      type='primary'
      disabled={!conversationId}
      data-testid={testId}
      onClick={() => {
        if (conversationId) onOpenConversation(conversationId);
      }}
    >
      {t('conversation.taskBoard.detail.openConversation')}
    </Button>
  );

  const overview = (
    <div className='flex flex-col gap-16px'>
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
      {task.assignee?.kind === 'squad' && task.assignee.id ? (
        <SquadRunPanel templateId={task.assignee.id} onOpenConversation={onOpenConversation} />
      ) : null}
      {interactive && canStartSquadForItem(task) ? (
        <TaskBoardSquadStart item={task} hasWorktree={Boolean(worktree)} onStarted={() => onSquadStarted?.()} />
      ) : null}
      {worktree ? (
        <TaskBoardWorktreePanel worktree={worktree} boardStatus={task.board_status} refreshKey={refreshKey} />
      ) : null}
      {interactive ? (
        <TaskBoardAssigneeEditor item={task} onUpdated={(item) => onItemUpdated?.(item)} onStale={() => onStale?.()} />
      ) : null}
    </div>
  );

  const conversationPane = (
    <div className='flex flex-col gap-12px' data-testid='task-detail-conversation'>
      <div className='text-13px text-t-secondary'>
        {conversationId
          ? t('conversation.taskBoard.detail3.conversationHint')
          : t('conversation.taskBoard.noConversation')}
      </div>
      <div>{openConversationButton('task-detail-conversation-open')}</div>
    </div>
  );

  return (
    <div
      className='absolute inset-0 z-10 bg-1 flex flex-col min-h-0 overflow-hidden'
      role='region'
      aria-label={task.title || task.id}
      data-testid='task-detail-page'
    >
      <div
        className={classNames(
          'shrink-0 flex items-center gap-12px border-b border-solid border-[var(--color-border-2)] border-x-0 border-t-0',
          isMobile ? 'px-16px py-10px' : 'px-40px py-14px'
        )}
      >
        <Button
          size='small'
          type='text'
          icon={<Left theme='outline' size='16' className='rtl:rotate-180' />}
          aria-label={t('conversation.taskBoard.detail3.back')}
          data-testid='task-detail-back'
          onClick={onClose}
        >
          {isMobile ? null : t('conversation.taskBoard.detail3.back')}
        </Button>
        <h2
          className='m-0 min-w-0 flex-1 text-16px font-medium text-t-primary truncate'
          data-testid='task-detail-title'
        >
          {task.title || task.id}
        </h2>
        {openConversationButton('task-board-detail-open-conversation')}
      </div>
      <div
        className={classNames(
          'flex-1 min-h-0 overflow-auto flex gap-24px',
          isMobile ? 'flex-col px-16px py-12px' : 'flex-row px-40px py-16px'
        )}
        data-testid='task-board-detail'
      >
        <div className='flex-1 min-w-0'>
          <Tabs activeTab={tab} onChange={(key) => setTab(key as TaskDetailTab)} lazyload={false}>
            <Tabs.TabPane key='overview' title={t('conversation.taskBoard.detail3.tabs.overview')}>
              {overview}
            </Tabs.TabPane>
            <Tabs.TabPane key='conversation' title={t('conversation.taskBoard.detail3.tabs.conversation')}>
              {conversationPane}
            </Tabs.TabPane>
            <Tabs.TabPane key='review' title={t('conversation.taskBoard.detail3.tabs.review')}>
              <TaskReviewTab
                item={task}
                interactive={interactive}
                refreshKey={refreshKey}
                onItemUpdated={onItemUpdated}
                onChanged={() => onSquadStarted?.()}
              />
            </Tabs.TabPane>
            <Tabs.TabPane key='activity' title={t('conversation.taskBoard.detail3.tabs.activity')}>
              {interactive ? (
                <TaskBoardTimeline taskId={task.id} refreshKey={refreshKey} />
              ) : (
                <div className='text-13px text-t-secondary'>{t('conversation.taskBoard.detail.none')}</div>
              )}
            </Tabs.TabPane>
          </Tabs>
        </div>
        <aside
          className={classNames('shrink-0 flex flex-col gap-12px', isMobile ? 'w-full' : 'w-300px')}
          data-testid='task-detail-properties'
        >
          <Descriptions column={1} data={data} labelStyle={{ whiteSpace: 'nowrap' }} size='small' />
        </aside>
      </div>
    </div>
  );
};

export default TaskBoardDetailDrawer;
