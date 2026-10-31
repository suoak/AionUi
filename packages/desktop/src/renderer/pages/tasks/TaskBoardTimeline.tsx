/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Message, Spin, Tag } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { TaskComment, TaskCommentEvent, TaskTraceEvent } from '@/common/types/agent/taskSession';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import {
  canEditComment,
  mergeBoardTimeline,
  parseTimelineEntry,
  upsertComment,
  type BoardTimelineRow,
} from './boardModel';
import { isLeaderEvalComment, isWorktreeKeptComment } from './workItemWorktreeModel';

type TaskBoardTimelineProps = {
  taskId: string;
  /** Bumped by the parent to reload (realtime fallback, stale conflict). */
  refreshKey: number;
};

const formatTime = (ms: number, locale: string): string => {
  try {
    return new Date(ms).toLocaleString(locale);
  } catch {
    return new Date(ms).toISOString();
  }
};

/** Load the latest run's replay page; older cores / empty runs → []. */
const loadLatestTrace = async (taskId: string): Promise<TaskTraceEvent[]> => {
  try {
    const runs = await ipcBridge.taskSession.run.list.invoke({ id: taskId });
    if (!Array.isArray(runs) || runs.length === 0) return [];
    const latest = [...runs].sort((a, b) => b.started_at - a.started_at)[0];
    if (!latest?.id) return [];
    const page = await ipcBridge.taskSession.run.replay.invoke({
      id: taskId,
      run_id: latest.id,
      limit: 200,
    });
    return Array.isArray(page?.events) ? page.events : [];
  } catch (error) {
    // 404/405 on older cores — comments-only timeline is still useful.
    console.warn('[TasksBoard] Trace merge skipped:', error);
    return [];
  }
};

/**
 * E6-6: comments + status/assignment/review events + high-signal trace from the
 * latest run, oldest first, with a comment box.
 */
const TaskBoardTimeline: React.FC<TaskBoardTimelineProps> = ({ taskId, refreshKey }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language ?? 'en-US';
  const [entries, setEntries] = useState<TaskComment[]>([]);
  const [traces, setTraces] = useState<TaskTraceEvent[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(() => {
    setState('loading');
    Promise.all([
      ipcBridge.taskSession.board.comments.list
        .invoke({ id: taskId })
        .then((list) => (Array.isArray(list) ? list : [])),
      loadLatestTrace(taskId),
    ])
      .then(([list, nextTraces]) => {
        setEntries(list);
        setTraces(nextTraces);
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

  // Realtime: comments and timeline events of this item (deduped by id).
  useEffect(() => {
    const apply = (event: TaskCommentEvent) => {
      const comment = event?.comment;
      if (!comment?.id || (event.task_session_id ?? comment.task_session_id) !== taskId) return;
      setEntries((prev) => upsertComment(prev, comment));
    };
    const offCreated = ipcBridge.taskSession.board.comments.created.on(apply);
    const offUpdated = ipcBridge.taskSession.board.comments.updated.on(apply);
    return () => {
      offCreated();
      offUpdated();
    };
  }, [taskId]);

  // Realtime: metadata-only push → refetch the latest run slice.
  useEffect(() => {
    const dispose = ipcBridge.taskTrace?.appended?.on?.((event) => {
      if (event?.task_session_id !== taskId) return;
      void loadLatestTrace(taskId).then(setTraces);
    });
    return () => {
      dispose?.();
    };
  }, [taskId]);

  const rows: BoardTimelineRow[] = useMemo(() => mergeBoardTimeline(entries, traces), [entries, traces]);

  const post = () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    ipcBridge.taskSession.board.comments.create
      .invoke({ id: taskId, body })
      .then((created) => {
        setDraft('');
        setEntries((prev) => upsertComment(prev, created));
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
        setEntries((prev) => upsertComment(prev, updated));
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

  const describeComment = (entry: TaskComment): string => {
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

  const describeTrace = (row: Extract<BoardTimelineRow, { source: 'trace' }>): string => {
    const { summary } = row.trace;
    switch (summary.kind) {
      case 'file_changed':
        return t('conversation.taskBoard.timeline.traceFileChanged', {
          path: summary.path || row.trace.event_type,
        });
      case 'tool_denied':
        return t('conversation.taskBoard.timeline.traceToolDenied', {
          tool: summary.tool || row.trace.event_type,
        });
      default:
        return t('conversation.taskBoard.timeline.traceGeneric', {
          type: summary.event_type,
        });
    }
  };

  const now = Date.now();

  return (
    <section className='flex flex-col gap-8px' data-testid='task-board-timeline'>
      <div className='text-13px font-medium text-t-primary'>{t('conversation.taskBoard.timeline.title')}</div>
      {state === 'loading' && entries.length === 0 && traces.length === 0 ? (
        <Spin size={16} />
      ) : state === 'failed' ? (
        <div className='flex items-center gap-8px text-12px text-t-secondary'>
          {t('conversation.taskBoard.timeline.loadFailed')}
          <Button size='mini' onClick={load}>
            {t('conversation.taskBoard.retry')}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className='text-12px text-t-tertiary'>{t('conversation.taskBoard.timeline.empty')}</div>
      ) : (
        <ol className='m-0 p-0 list-none flex flex-col gap-8px'>
          {rows.map((row) =>
            row.source === 'comment' ? (
              <li
                key={row.id}
                data-testid={`task-board-timeline-entry-${row.comment.id}`}
                data-kind={row.comment.kind}
                data-leader-eval={isLeaderEvalComment(row.comment) ? 'true' : undefined}
                data-worktree-note={isWorktreeKeptComment(row.comment) ? 'true' : undefined}
                className={
                  row.comment.kind === 'comment'
                    ? 'rd-6px bg-fill-1 p-8px flex flex-col gap-4px'
                    : 'text-12px text-t-secondary flex flex-col gap-2px'
                }
              >
                <div className='flex items-center justify-between gap-8px text-12px text-t-tertiary'>
                  <span>
                    {isLeaderEvalComment(row.comment) ? (
                      <Tag size='small' color='arcoblue' className='me-4px'>
                        {t('conversation.taskBoard.timeline.leaderEval')}
                      </Tag>
                    ) : null}
                    {t(`conversation.taskBoard.timeline.author.${row.comment.author_kind}`)}
                    {row.comment.author_kind === 'system' ? '' : ` · ${row.comment.author_id}`}
                    {' · '}
                    {formatTime(row.comment.created_at, locale)}
                    {row.comment.edited_at ? ` · ${t('conversation.taskBoard.timeline.edited')}` : ''}
                  </span>
                  {canEditComment(row.comment, now) && editing?.id !== row.comment.id ? (
                    <Button
                      size='mini'
                      type='text'
                      onClick={() => setEditing({ id: row.comment.id, body: row.comment.body })}
                      data-testid={`task-board-timeline-edit-${row.comment.id}`}
                    >
                      {t('conversation.taskBoard.timeline.edit')}
                    </Button>
                  ) : null}
                </div>
                {editing?.id === row.comment.id ? (
                  <div className='flex flex-col gap-6px'>
                    <Input.TextArea
                      value={editing.body}
                      onChange={(body) => setEditing({ id: row.comment.id, body })}
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
                      row.comment.kind === 'comment'
                        ? 'text-13px text-t-primary whitespace-pre-wrap break-words'
                        : 'break-words'
                    }
                  >
                    {describeComment(row.comment)}
                  </div>
                )}
              </li>
            ) : (
              <li
                key={row.id}
                data-testid={`task-board-timeline-trace-${row.trace.event_id}`}
                data-kind='trace'
                data-event-type={row.trace.event_type}
                className='text-12px text-t-secondary flex flex-col gap-2px'
              >
                <div className='flex items-center justify-between gap-8px text-12px text-t-tertiary'>
                  <span>
                    {t('conversation.taskBoard.timeline.trace')}
                    {' · '}
                    {formatTime(row.trace.timestamp, locale)}
                  </span>
                </div>
                <div className='break-words'>{describeTrace(row)}</div>
              </li>
            )
          )}
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
