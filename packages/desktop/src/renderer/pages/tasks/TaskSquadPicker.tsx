/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { Button, Message, Select, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { TaskAssignee, TaskBoardItem } from '@/common/types/agent/taskSession';
import { boardErrorKey, isBoardItemStale } from './boardModel';

type TaskSquadPickerProps = {
  item: TaskBoardItem;
  onUpdated: (item: TaskBoardItem) => void;
  /** Optimistic-lock conflict; the board refetches and the user retries. */
  onStale?: () => void;
};

/**
 * 3.0 U8: the free-form assignee editor is gone (a task runs with its
 * assistant). What stays, under Advanced, is handing the task to a Squad
 * template, or taking it back.
 */
const TaskSquadPicker: React.FC<TaskSquadPickerProps> = ({ item, onUpdated, onStale }) => {
  const { t } = useTranslation();
  const assignedSquad = item.assignee?.kind === 'squad' ? item.assignee.id : '';
  const [squadId, setSquadId] = useState(assignedSquad);
  const [pending, setPending] = useState(false);
  const { data: squads } = useSWR('squads.list', () => ipcBridge.squads?.list?.invoke({}) ?? Promise.resolve([]), {
    shouldRetryOnError: false,
  });

  useEffect(() => {
    setSquadId(assignedSquad);
  }, [item.id, assignedSquad]);

  const save = (assignee: TaskAssignee | null) => {
    setPending(true);
    ipcBridge.taskSession.board.update
      .invoke({ id: item.id, updates: { assignee, expected_updated_at: item.updated_at } })
      .then(onUpdated)
      .catch((error) => {
        console.error('[TasksBoard] Squad assign failed:', error);
        if (isBoardItemStale(error) && onStale) onStale();
        else Message.error(t(boardErrorKey(error)));
      })
      .finally(() => setPending(false));
  };

  if (!squads || squads.length === 0) {
    return assignedSquad ? null : (
      <Typography.Text type='secondary' className='text-12px' data-testid='task-squad-none'>
        {t('conversation.taskBoard.advanced.noSquads')}
      </Typography.Text>
    );
  }

  return (
    <section className='flex flex-col gap-6px' data-testid='task-squad-picker'>
      <div className='text-13px font-medium text-t-primary'>{t('conversation.taskBoard.advanced.squad')}</div>
      <Typography.Text type='secondary' className='text-12px'>
        {t('conversation.taskBoard.advanced.squadHint')}
      </Typography.Text>
      <Select
        size='small'
        showSearch
        value={squadId || undefined}
        onChange={(value: string) => setSquadId(value)}
        placeholder={t('conversation.taskBoard.advanced.squadPlaceholder')}
        data-testid='task-board-assignee-squad'
      >
        {squads.map((squad) => (
          <Select.Option key={squad.id} value={squad.id}>
            {squad.name}
          </Select.Option>
        ))}
      </Select>
      <div className='flex justify-end gap-8px'>
        {assignedSquad ? (
          <Button size='small' disabled={pending} onClick={() => save(null)} data-testid='task-board-assignee-clear'>
            {t('conversation.taskBoard.advanced.unassign')}
          </Button>
        ) : null}
        <Button
          size='small'
          type='primary'
          loading={pending}
          disabled={!squadId || squadId === assignedSquad}
          onClick={() => save({ kind: 'squad', id: squadId })}
          data-testid='task-board-assignee-save'
        >
          {t('conversation.taskBoard.advanced.assign')}
        </Button>
      </div>
    </section>
  );
};

export default TaskSquadPicker;
