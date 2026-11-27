/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { Button, Empty } from '@arco-design/web-react';
import type { TaskBoardItem, TaskLane } from '@/common/types/agent/taskSession';
import type { WorktreeInfo } from '@/common/types/worktree';
import { formatRelativeTime } from '@/renderer/utils/chat/relativeTime';
import { isTaskFlowItem, needsYouReasonForItem, planProgress, type LaneItems } from './laneModel';

type TaskListViewProps = {
  lanes: LaneItems;
  visibleLanes: readonly TaskLane[];
  interactive: boolean;
  isMobile: boolean;
  worktrees: Map<string, WorktreeInfo>;
  onOpen: (item: TaskBoardItem) => void;
  onStart: (item: TaskBoardItem) => void;
};

/** 3.0 U2: list view of the same lanes (`/tasks?view=list`), grouped by lane. */
const TaskListView: React.FC<TaskListViewProps> = ({
  lanes,
  visibleLanes,
  interactive,
  isMobile,
  worktrees,
  onOpen,
  onStart,
}) => {
  const { t, i18n } = useTranslation();
  const total = visibleLanes.reduce((sum, lane) => sum + lanes[lane].length, 0);

  return (
    <div
      className={classNames(
        'flex-1 min-h-0 overflow-y-auto box-border',
        isMobile ? 'px-16px pb-16px' : 'px-40px pb-24px'
      )}
      data-testid='tasks-list-view'
    >
      {total === 0 ? (
        <Empty className='py-32px' description={t('conversation.taskBoard.emptyColumnHint')} />
      ) : (
        visibleLanes.map((lane) =>
          lanes[lane].length === 0 ? null : (
            <section key={lane} className='mb-16px' data-testid={`tasks-list-lane-${lane}`}>
              <header className='flex items-center gap-8px py-6px text-13px font-medium text-t-primary'>
                <span>{t(`conversation.taskBoard.lanes.${lane}`)}</span>
                <span className='text-12px text-t-tertiary'>{lanes[lane].length}</span>
              </header>
              <div className='rd-8px border border-solid border-[var(--color-border-2)] overflow-hidden'>
                {lanes[lane].map((item) => {
                  const reason = needsYouReasonForItem(item);
                  const plan = planProgress(item);
                  const branch = worktrees.get(item.id)?.branch;
                  const canStart =
                    interactive &&
                    lane === 'todo' &&
                    isTaskFlowItem(item) &&
                    Boolean(item.assistant_id) &&
                    typeof item.queued_at !== 'number';
                  return (
                    <div
                      key={item.id}
                      role='button'
                      tabIndex={0}
                      data-testid={`tasks-list-row-${item.id}`}
                      className='flex items-center gap-12px px-12px py-8px bg-2 hover:bg-fill-2 cursor-pointer border-b border-b-solid border-[var(--color-border-2)] last:border-b-0'
                      onClick={() => onOpen(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpen(item);
                        }
                      }}
                    >
                      <div className='min-w-0 flex-1'>
                        <div className='text-14px text-t-primary truncate'>{item.title || item.id}</div>
                        <div className='text-12px text-t-tertiary truncate'>
                          {[
                            reason ? t(`conversation.taskBoard.needsYou.${reason}`) : null,
                            plan
                              ? t('conversation.taskBoard.flow.planProgress', { done: plan.done, total: plan.total })
                              : null,
                            typeof item.queued_at === 'number' ? t('conversation.taskBoard.flow.queuedBadge') : null,
                            branch ?? null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                      <span className='shrink-0 text-12px text-t-tertiary'>
                        {formatRelativeTime(item.updated_at, i18n?.language ?? 'en-US')}
                      </span>
                      {canStart ? (
                        <Button
                          size='mini'
                          type='primary'
                          data-testid={`tasks-list-start-${item.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onStart(item);
                          }}
                        >
                          {t('conversation.taskBoard.flow.start')}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          )
        )
      )}
    </div>
  );
};

export default TaskListView;
