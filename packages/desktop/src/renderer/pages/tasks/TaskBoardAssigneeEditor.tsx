/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Message, Select } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { TaskAssignee, TaskAssigneeKind, TaskBoardItem } from '@/common/types/agent/taskSession';
import { boardErrorKey } from './boardModel';

const ASSIGNEE_KINDS: readonly TaskAssigneeKind[] = ['user', 'agent', 'squad'];

type TaskBoardAssigneeEditorProps = {
  item: TaskBoardItem;
  onUpdated: (item: TaskBoardItem) => void;
};

/** Assign the item to a user, agent or squad (by id), or clear the assignee. */
const TaskBoardAssigneeEditor: React.FC<TaskBoardAssigneeEditorProps> = ({ item, onUpdated }) => {
  const { t } = useTranslation();
  const [kind, setKind] = useState<TaskAssigneeKind>(item.assignee?.kind ?? 'agent');
  const [assigneeId, setAssigneeId] = useState(item.assignee?.id ?? '');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setKind(item.assignee?.kind ?? 'agent');
    setAssigneeId(item.assignee?.id ?? '');
  }, [item.id, item.assignee?.kind, item.assignee?.id]);

  const save = (assignee: TaskAssignee | null) => {
    setPending(true);
    ipcBridge.taskSession.board.update
      .invoke({ id: item.id, updates: { assignee } })
      .then(onUpdated)
      .catch((error) => {
        console.error('[TasksBoard] Assign failed:', error);
        Message.error(t(boardErrorKey(error)));
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
        <Input
          size='small'
          value={assigneeId}
          onChange={setAssigneeId}
          placeholder={t('conversation.taskBoard.assignee.idPlaceholder')}
          data-testid='task-board-assignee-id'
        />
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
