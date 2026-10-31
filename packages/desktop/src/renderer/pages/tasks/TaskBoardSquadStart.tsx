/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Message } from '@arco-design/web-react';
import { useSWRConfig } from 'swr';
import { ipcBridge } from '@/common';
import type { SquadWorkItemWorktree } from '@/common/types/agent/squad';
import type { TaskBoardItem } from '@/common/types/agent/taskSession';
import { squadStartErrorKey, squadStartErrorReason } from './workItemWorktreeModel';

type TaskBoardSquadStartProps = {
  item: TaskBoardItem;
  /** The item already has a shared worktree; the repository field is then not needed. */
  hasWorktree: boolean;
  onStarted?: (result: { teamId: string; worktree: SquadWorkItemWorktree | null }) => void;
};

/**
 * M8 E7-6b / Q12: start (another) instance of the assigned Squad for this
 * work item. Core links the team to the card and creates — or reuses — the
 * item's shared worktree, from `repo_path` or the project folder.
 */
const TaskBoardSquadStart: React.FC<TaskBoardSquadStartProps> = ({ item, hasWorktree, onStarted }) => {
  const { t } = useTranslation();
  const { mutate } = useSWRConfig();
  const [repoPath, setRepoPath] = useState('');
  const [starting, setStarting] = useState(false);
  const templateId = item.assignee?.kind === 'squad' ? item.assignee.id : '';

  const start = () => {
    if (!templateId || starting) return;
    const repo = repoPath.trim();
    setStarting(true);
    ipcBridge.squads.instantiate
      .invoke({
        id: templateId,
        input: { work_item_id: item.id, ...(repo && !hasWorktree ? { repo_path: repo } : {}) },
      })
      .then((result) => {
        Message.success(t('conversation.taskBoard.squadStart.started'));
        // The drawer's run panel reads the shared team list.
        void mutate((key) => typeof key === 'string' && key.startsWith('teams/'));
        onStarted?.({ teamId: result.team?.id ?? '', worktree: result.worktree ?? null });
      })
      .catch((error) => {
        console.error('[TasksBoard] Failed to start Squad:', error);
        const reason = squadStartErrorReason(error);
        const message = t(squadStartErrorKey(error));
        Message.error(reason ? `${message} (${reason})` : message);
      })
      .finally(() => setStarting(false));
  };

  return (
    <section className='flex flex-col gap-6px' data-testid='task-board-squad-start'>
      {hasWorktree ? null : (
        <Input
          size='small'
          value={repoPath}
          onChange={setRepoPath}
          allowClear
          placeholder={t('conversation.taskBoard.squadStart.repoPlaceholder')}
          data-testid='task-board-squad-start-repo'
        />
      )}
      <div className='flex items-center justify-between gap-8px'>
        <span className='text-12px text-t-tertiary'>
          {t(hasWorktree ? 'conversation.taskBoard.squadStart.reuseHint' : 'conversation.taskBoard.squadStart.hint')}
        </span>
        <Button
          size='small'
          type='primary'
          loading={starting}
          onClick={start}
          data-testid='task-board-squad-start-button'
        >
          {t('conversation.taskBoard.squadStart.start')}
        </Button>
      </div>
    </section>
  );
};

export default TaskBoardSquadStart;
