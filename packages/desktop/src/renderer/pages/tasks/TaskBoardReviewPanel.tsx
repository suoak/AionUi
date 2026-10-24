/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Message } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { TaskBoardItem, TaskBoardReviewDecision } from '@/common/types/agent/taskSession';
import { boardErrorKey } from './boardModel';

type TaskBoardReviewPanelProps = {
  item: TaskBoardItem;
  onReviewed: (item: TaskBoardItem) => void;
};

/** Review gate for `in_review` items: approve → done, reject (comment required) → todo. */
const TaskBoardReviewPanel: React.FC<TaskBoardReviewPanelProps> = ({ item, onReviewed }) => {
  const { t } = useTranslation();
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState<TaskBoardReviewDecision | null>(null);

  const submit = (decision: TaskBoardReviewDecision) => {
    const trimmed = comment.trim();
    if (decision === 'reject' && !trimmed) {
      Message.warning(t('conversation.taskBoard.review.rejectNeedsComment'));
      return;
    }
    setPending(decision);
    ipcBridge.taskSession.board.review
      .invoke({ id: item.id, decision, ...(trimmed ? { comment: trimmed } : {}) })
      .then((result) => {
        setComment('');
        onReviewed(result.item);
      })
      .catch((error) => {
        console.error('[TasksBoard] Review failed:', error);
        Message.error(t(boardErrorKey(error)));
      })
      .finally(() => setPending(null));
  };

  return (
    <section
      className='rd-8px border border-solid border-[var(--color-border-2)] p-12px flex flex-col gap-8px'
      data-testid='task-board-review'
    >
      <div className='text-13px font-medium text-t-primary'>{t('conversation.taskBoard.review.title')}</div>
      <div className='text-12px text-t-secondary'>{t('conversation.taskBoard.review.hint')}</div>
      <Input.TextArea
        value={comment}
        onChange={setComment}
        maxLength={10000}
        autoSize={{ minRows: 2, maxRows: 6 }}
        placeholder={t('conversation.taskBoard.review.commentPlaceholder')}
        data-testid='task-board-review-comment'
      />
      <div className='flex justify-end gap-8px'>
        <Button
          status='danger'
          loading={pending === 'reject'}
          disabled={pending !== null}
          onClick={() => submit('reject')}
          data-testid='task-board-review-reject'
        >
          {t('conversation.taskBoard.review.reject')}
        </Button>
        <Button
          type='primary'
          loading={pending === 'approve'}
          disabled={pending !== null}
          onClick={() => submit('approve')}
          data-testid='task-board-review-approve'
        >
          {t('conversation.taskBoard.review.approve')}
        </Button>
      </div>
    </section>
  );
};

export default TaskBoardReviewPanel;
