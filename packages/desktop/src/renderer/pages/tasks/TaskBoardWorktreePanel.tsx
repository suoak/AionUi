/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { TaskBoardStatus } from '@/common/types/agent/taskSession';
import type { WorktreeDiffStat, WorktreeInfo } from '@/common/types/worktree';

const STATUS_COLOR: Partial<Record<WorktreeInfo['status'], string>> = {
  creating: 'arcoblue',
  ready: 'green',
  unbound: 'gray',
  failed: 'red',
  orphaned: 'orange',
};

type TaskBoardWorktreePanelProps = {
  worktree: WorktreeInfo;
  boardStatus: TaskBoardStatus;
  /** Bumped by the parent to reload the diff summary. */
  refreshKey?: number;
};

/**
 * M8 Q12: the work item's shared worktree (one per item, reused by every
 * Squad instance). Closing the item keeps the directory and branch.
 */
const TaskBoardWorktreePanel: React.FC<TaskBoardWorktreePanelProps> = ({ worktree, boardStatus, refreshKey = 0 }) => {
  const { t } = useTranslation();
  const [stat, setStat] = useState<WorktreeDiffStat | null>(null);
  const ready = worktree.status === 'ready' || worktree.status === 'unbound';

  // Reload when the worktree or the card's column changes (e.g. members finished → in_review).
  useEffect(() => {
    const diffStat = ipcBridge.worktree?.diffStat;
    if (!ready || !diffStat) {
      setStat(null);
      return;
    }
    let cancelled = false;
    diffStat
      .invoke({ id: worktree.id })
      .then((next) => {
        if (!cancelled) setStat(next && typeof next.files_changed === 'number' ? next : null);
      })
      .catch((error) => {
        if (!cancelled) setStat(null);
        console.warn('[TasksBoard] Worktree diff summary unavailable:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [worktree.id, worktree.updated_at, ready, boardStatus, refreshKey]);

  const closed = boardStatus === 'done' || boardStatus === 'cancelled';

  return (
    <section data-testid='task-board-worktree' data-worktree-id={worktree.id} className='flex flex-col gap-6px'>
      <div className='flex items-center gap-6px text-13px font-medium text-t-primary'>
        {t('conversation.taskBoard.worktree.title')}
        <Tag size='small' color={STATUS_COLOR[worktree.status]} data-testid='task-board-worktree-status'>
          {t(`conversation.taskBoard.worktree.status.${worktree.status}`, { defaultValue: worktree.status })}
        </Tag>
      </div>
      <dl className='m-0 grid grid-cols-[auto_1fr] gap-x-8px gap-y-4px text-12px'>
        <dt className='text-t-tertiary'>{t('conversation.taskBoard.worktree.branch')}</dt>
        <dd className='m-0 font-mono break-all text-t-primary' data-testid='task-board-worktree-branch'>
          {worktree.branch}
        </dd>
        <dt className='text-t-tertiary'>{t('conversation.taskBoard.worktree.path')}</dt>
        <dd className='m-0 font-mono break-all text-t-primary select-text' data-testid='task-board-worktree-path'>
          {worktree.path}
        </dd>
        <dt className='text-t-tertiary'>{t('conversation.taskBoard.worktree.source')}</dt>
        <dd className='m-0 font-mono break-all text-t-secondary'>{worktree.source_repo_path}</dd>
        {stat ? (
          <>
            <dt className='text-t-tertiary'>{t('conversation.taskBoard.worktree.changes')}</dt>
            <dd className='m-0 text-t-secondary' data-testid='task-board-worktree-changes'>
              {t('conversation.taskBoard.worktree.changesSummary', {
                files: stat.files_changed,
                additions: stat.additions,
                deletions: stat.deletions,
              })}
            </dd>
          </>
        ) : null}
      </dl>
      {worktree.status === 'failed' && worktree.error?.message ? (
        <div className='text-12px text-[rgb(var(--danger-6))] break-words'>{worktree.error.message}</div>
      ) : null}
      <div className='text-12px text-t-tertiary' data-testid='task-board-worktree-hint'>
        {t(closed ? 'conversation.taskBoard.worktree.kept' : 'conversation.taskBoard.worktree.shared')}
      </div>
    </section>
  );
};

export default TaskBoardWorktreePanel;
