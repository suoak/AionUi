/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Message, Spin } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { TaskComment } from '@/common/types/agent/taskSession';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { canEditComment, parseTimelineEntry } from './boardModel';

type TaskBoardTimelineProps = {
  taskId: string;
  /** Bumped by the parent after a board mutation so new events show up. */
  refreshKey: number;
};

const formatTime = (ms: number, locale: string): string => {
  try {
    return new Date(ms).toLocaleString(locale);
  } catch {
    return new Date(ms).toISOString();
  }
};

/** Comments and board events of one item, oldest first, with a comment box. */
const TaskBoardTimeline: React.FC<TaskBoardTimelineProps> = ({ taskId, refreshKey }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language ?? 'en-US';
  const [entries, setEntries] = useState<TaskComment[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(() => {
    setState('loading');
    ipcBridge.taskSession.board.comments.list
      .invoke({ id: taskId })
      .then((list) => {
        setEntries(Array.isArray(list) ? list : []);
        setState('ready');
      })
      .catch((error) => {
        console.error('[TasksBoard] Failed to load comments:', error);
        setState('failed');
      });
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const post = () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    ipcBridge.taskSession.board.comments.create
      .invoke({ id: taskId, body })
      .then((created) => {
        setDraft('');
        setEntries((prev) => [...prev, created]);
      })
      .catch((error) => {
        console.error('[TasksBoard] Failed to post comment:', error);
        Message.error(t('conversation.taskBoard.errors.generic'));
      })
      .finally(() => setPosting(false));
  };

  const saveEdit = () => {
    if (!editing) return;
    const body = editing.body.trim();
    if (!body) return;
    setSavingEdit(true);
    ipcBridge.taskSession.board.comments.edit
      .invoke({ id: taskId, comment_id: editing.id, body })
      .then((updated) => {
        setEditing(null);
        setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      })
      .catch((error) => {
        console.error('[TasksBoard] Failed to edit comment:', error);
        Message.error(
          t(
            isBackendHttpError(error) && error.status === 409
              ? 'conversation.taskBoard.errors.commentEditWindow'
              : 'conversation.taskBoard.errors.generic'
          )
        );
      })
      .finally(() => setSavingEdit(false));
  };

  const describe = (entry: TaskComment): string => {
    const event = parseTimelineEntry(entry);
    switch (event.kind) {
      case 'comment':
      case 'unknown':
        return event.text;
      case 'status_change':
        return t('conversation.taskBoard.timeline.statusChange', {
          from: t(`conversation.taskBoard.columns.${event.from}`, { defaultValue: event.from }),
          to: t(`conversation.taskBoard.columns.${event.to}`, { defaultValue: event.to }),
        });
      case 'assignment':
        return event.assignee
          ? t('conversation.taskBoard.timeline.assigned', {
              assignee: `${t(`conversation.taskBoard.assignee.kind.${event.assignee.kind}`)}: ${event.assignee.id}`,
            })
          : t('conversation.taskBoard.timeline.unassigned');
      case 'review_decision': {
        const head = t(
          event.decision === 'approve'
            ? 'conversation.taskBoard.timeline.approved'
            : 'conversation.taskBoard.timeline.rejected'
        );
        return event.comment ? `${head}: ${event.comment}` : head;
      }
    }
  };

  const now = Date.now();

  return (
    <section className='flex flex-col gap-8px' data-testid='task-board-timeline'>
      <div className='text-13px font-medium text-t-primary'>{t('conversation.taskBoard.timeline.title')}</div>
      {state === 'loading' && entries.length === 0 ? (
        <Spin size={16} />
      ) : state === 'failed' ? (
        <div className='flex items-center gap-8px text-12px text-t-secondary'>
          {t('conversation.taskBoard.timeline.loadFailed')}
          <Button size='mini' onClick={load}>
            {t('conversation.taskBoard.retry')}
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <div className='text-12px text-t-tertiary'>{t('conversation.taskBoard.timeline.empty')}</div>
      ) : (
        <ol className='m-0 p-0 list-none flex flex-col gap-8px'>
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-testid={`task-board-timeline-entry-${entry.id}`}
              data-kind={entry.kind}
              className={
                entry.kind === 'comment'
                  ? 'rd-6px bg-fill-1 p-8px flex flex-col gap-4px'
                  : 'text-12px text-t-secondary flex flex-col gap-2px'
              }
            >
              <div className='flex items-center justify-between gap-8px text-12px text-t-tertiary'>
                <span>
                  {t(`conversation.taskBoard.timeline.author.${entry.author_kind}`)}
                  {entry.author_kind === 'system' ? '' : ` · ${entry.author_id}`}
                  {' · '}
                  {formatTime(entry.created_at, locale)}
                  {entry.edited_at ? ` · ${t('conversation.taskBoard.timeline.edited')}` : ''}
                </span>
                {canEditComment(entry, now) && editing?.id !== entry.id ? (
                  <Button
                    size='mini'
                    type='text'
                    onClick={() => setEditing({ id: entry.id, body: entry.body })}
                    data-testid={`task-board-timeline-edit-${entry.id}`}
                  >
                    {t('conversation.taskBoard.timeline.edit')}
                  </Button>
                ) : null}
              </div>
              {editing?.id === entry.id ? (
                <div className='flex flex-col gap-6px'>
                  <Input.TextArea
                    value={editing.body}
                    onChange={(body) => setEditing({ id: entry.id, body })}
                    maxLength={10000}
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    data-testid='task-board-timeline-edit-input'
                  />
                  <div className='flex justify-end gap-6px'>
                    <Button size='mini' onClick={() => setEditing(null)}>
                      {t('conversation.taskBoard.timeline.cancel')}
                    </Button>
                    <Button
                      size='mini'
                      type='primary'
                      loading={savingEdit}
                      disabled={!editing.body.trim()}
                      onClick={saveEdit}
                      data-testid='task-board-timeline-edit-save'
                    >
                      {t('conversation.taskBoard.timeline.save')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className={
                    entry.kind === 'comment'
                      ? 'text-13px text-t-primary whitespace-pre-wrap break-words'
                      : 'break-words'
                  }
                >
                  {describe(entry)}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <Input.TextArea
        value={draft}
        onChange={setDraft}
        maxLength={10000}
        autoSize={{ minRows: 2, maxRows: 6 }}
        placeholder={t('conversation.taskBoard.timeline.placeholder')}
        data-testid='task-board-timeline-input'
      />
      <div className='flex justify-end'>
        <Button
          size='small'
          type='primary'
          loading={posting}
          disabled={!draft.trim()}
          onClick={post}
          data-testid='task-board-timeline-submit'
        >
          {t('conversation.taskBoard.timeline.submit')}
        </Button>
      </div>
    </section>
  );
};

export default TaskBoardTimeline;
