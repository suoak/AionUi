/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { Button, Input, Message, Select } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { TaskAssignee, TaskAssigneeKind, TaskBoardItem } from '@/common/types/agent/taskSession';
import { boardErrorKey, isBoardItemStale } from './boardModel';

const ASSIGNEE_KINDS: readonly TaskAssigneeKind[] = ['user', 'agent', 'squad'];

type TaskBoardAssigneeEditorProps = {
  item: TaskBoardItem;
  onUpdated: (item: TaskBoardItem) => void;
  /** Optimistic-lock conflict; the board refetches and the user retries. */
  onStale?: () => void;
};

/** Assign the item to a user, agent or squad (by id), or clear the assignee. */
const TaskBoardAssigneeEditor: React.FC<TaskBoardAssigneeEditorProps> = ({ item, onUpdated, onStale }) => {
  const { t } = useTranslation();
  const [kind, setKind] = useState<TaskAssigneeKind>(item.assignee?.kind ?? 'agent');
  const [assigneeId, setAssigneeId] = useState(item.assignee?.id ?? '');
  const [pending, setPending] = useState(false);
  // Squad templates (E7); falls back to a free-text id while the route is unavailable.
  const { data: squads } = useSWR(kind === 'squad' ? 'squads.list' : null, () => ipcBridge.squads.list.invoke({}), {
    shouldRetryOnError: false,
  });

  useEffect(() => {
    setKind(item.assignee?.kind ?? 'agent');
    setAssigneeId(item.assignee?.id ?? '');
  }, [item.id, item.assignee?.kind, item.assignee?.id]);

  const save = (assignee: TaskAssignee | null) => {
    setPending(true);
    ipcBridge.taskSession.board.update
      .invoke({ id: item.id, updates: { assignee, expected_updated_at: item.updated_at } })
      .then(onUpdated)
      .catch((error) => {
        console.error('[TasksBoard] Assign failed:', error);
        if (isBoardItemStale(error) && onStale) onStale();
        else Message.error(t(boardErrorKey(error)));
      })
      .finally(() => setPending(false));
  };

  const trimmed = assigneeId.trim();
  const unchanged = item.assignee?.kind === kind && item.assignee?.id === trimmed;

  return (
    <section className='flex flex-col gap-6px' data-testid='task-board-assignee'>
      <div className='text-13px font-medium text-t-primary'>{t('conversation.taskBoard.assignee.title')}</div>
      <div className='flex items-center gap-6px'>
        <Select
          className='w-110px shrink-0'
          size='small'
          value={kind}
          onChange={(value: TaskAssigneeKind) => setKind(value)}
          data-testid='task-board-assignee-kind'
        >
          {ASSIGNEE_KINDS.map((k) => (
            <Select.Option key={k} value={k}>
              {t(`conversation.taskBoard.assignee.kind.${k}`)}
            </Select.Option>
          ))}
        </Select>
        {kind === 'squad' && squads && squads.length > 0 ? (
          <Select
            size='small'
            showSearch
            value={assigneeId || undefined}
            onChange={(value: string) => setAssigneeId(value)}
            placeholder={t('conversation.taskBoard.assignee.idPlaceholder')}
            data-testid='task-board-assignee-squad'
          >
            {squads.map((squad) => (
              <Select.Option key={squad.id} value={squad.id}>
                {squad.name}
              </Select.Option>
            ))}
          </Select>
        ) : (
          <Input
            size='small'
            value={assigneeId}
            onChange={setAssigneeId}
            placeholder={t('conversation.taskBoard.assignee.idPlaceholder')}
            data-testid='task-board-assignee-id'
          />
        )}
      </div>
      <div className='flex justify-end gap-8px'>
        <Button
          size='small'
          disabled={pending || !item.assignee}
          onClick={() => save(null)}
          data-testid='task-board-assignee-clear'
        >
          {t('conversation.taskBoard.assignee.unassign')}
        </Button>
        <Button
          size='small'
          type='primary'
          loading={pending}
          disabled={!trimmed || unchanged}
          onClick={() => save({ kind, id: trimmed })}
          data-testid='task-board-assignee-save'
        >
          {t('conversation.taskBoard.assignee.save')}
        </Button>
      </div>
    </section>
  );
};

export default TaskBoardAssigneeEditor;
