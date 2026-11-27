/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import classNames from 'classnames';
import { Alert, Button, Empty, Message, Radio, Spin, Switch } from '@arco-design/web-react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { TaskBoardItem, TaskBoardStatus, TaskLane, UpdateTaskBoardInput } from '@/common/types/agent/taskSession';
import type { WorktreeInfo } from '@/common/types/worktree';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import SettingsPageHeader from '@/renderer/pages/settings/components/SettingsPageHeader';
import TaskBoardCard from './TaskBoardCard';
import TaskBoardDetailDrawer from './TaskBoardDetailDrawer';
import GithubIssueImportModal from './GithubIssueImportModal';
import TaskListView from './TaskListView';
import { VISIBLE_LANES, laneDropAction, laneForItem, lanesFromColumns } from './laneModel';
import { useWorkItemWorktrees } from './useWorkItemWorktrees';
import {
  REALTIME_FALLBACK_MS,
  applyBoardItem,
  boardErrorKey,
  canUserMoveBoardItem,
  columnsFromBoardResponse,
  columnsFromTaskSessions,
  findBoardItem,
  isBoardApiUnavailable,
  isBoardItemStale,
  moveItemInColumns,
  type BoardItemColumns,
} from './boardModel';

type LoadState = 'loading' | 'ready' | 'failed';
/** `board`: Core board API (editable). `legacy`: older core, task-session list, read-only. */
type DataSource = 'board' | 'legacy';

const EMPTY_COLUMNS = columnsFromTaskSessions([]);

const DraggableCard: React.FC<{
  item: TaskBoardItem;
  disabled: boolean;
  onOpen: (item: TaskBoardItem) => void;
  onStart?: (item: TaskBoardItem) => void;
  worktree?: WorktreeInfo | null;
}> = ({ item, disabled, onOpen, onStart, worktree }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { from: laneForItem(item) },
    disabled,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} role={undefined} tabIndex={undefined}>
      <TaskBoardCard task={item} onOpen={onOpen} onStart={onStart} dragging={isDragging} worktree={worktree} />
    </div>
  );
};

const DroppableLane: React.FC<{
  lane: TaskLane;
  /** The card being dragged, if any. */
  dragItem: TaskBoardItem | null;
  children: React.ReactNode;
}> = ({ lane, dragItem, children }) => {
  const allowed = dragItem !== null && laneDropAction(dragItem, lane) !== null;
  const dragFrom = dragItem ? laneForItem(dragItem) : null;
  const { setNodeRef, isOver } = useDroppable({ id: lane, disabled: dragItem !== null && !allowed });
  return (
    <section
      ref={setNodeRef}
      data-testid={`tasks-board-lane-${lane}`}
      data-drop-allowed={dragItem === null ? undefined : String(allowed)}
      className={classNames(
        'shrink-0 w-260px min-h-0 flex flex-col rd-10px bg-fill-1 box-border border-2 border-solid border-transparent',
        dragFrom !== null && dragFrom !== lane && !allowed && 'opacity-50',
        isOver && allowed && 'border-[rgb(var(--primary-6))]'
      )}
    >
      {children}
    </section>
  );
};

/**
 * M8 E6-4: work-item board on the Core board API (`/api/task-sessions/board`).
 * Cards move between columns by drag (or from the detail drawer); the server
 * decides, and a rejected move rolls back with the reason. `done` is reached
 * only through review. Cores without the board API fall back to the read-only
 * task-session list with the D6-3 run-status mapping.
 *
 * Realtime: `task.board.updated` pushes replace cards in place. Each mutation
 * also arms a short fallback; if no matching push arrives (older core, socket
 * down) the board refetches. Board PATCHes carry `expected_updated_at`, and a
 * 409 `board_item_stale` rolls back, refetches and asks the user to retry.
 */
const TasksBoardPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkTask = searchParams.get('task');
  const isMobile = useLayoutContext()?.isMobile ?? false;
  const [columns, setColumns] = useState<BoardItemColumns>(EMPTY_COLUMNS);
  const [source, setSource] = useState<DataSource>('board');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [hasData, setHasData] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkTask);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const view = searchParams.get('view') === 'list' ? 'list' : 'board';
  const [refreshKey, setRefreshKey] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const loadSeq = useRef(0);
  // The pointer-up that ends a drag also clicks the card; ignore that click.
  const lastDragEndAt = useRef(0);
  // Item id → updated_at a push must reach before its fallback timer is dropped.
  const pendingFallbacks = useRef(new Map<string, { updatedAt: number; timer: ReturnType<typeof setTimeout> }>());

  // Pointer only: Enter/Space on a card opens the drawer, which also offers the column move.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = useCallback((silent = false) => {
    const seq = ++loadSeq.current;
    if (!silent) setLoadState('loading');
    const done = (next: BoardItemColumns, nextSource: DataSource) => {
      if (seq !== loadSeq.current) return;
      setColumns(next);
      setSource(nextSource);
      setHasData(true);
      setLoadState('ready');
    };
    const fail = (error: unknown) => {
      if (seq !== loadSeq.current) return;
      console.error('[TasksBoard] Failed to load board:', error);
      if (!silent) setLoadState('failed');
    };
    ipcBridge.taskSession.board.get
      .invoke({})
      .then((response) => done(columnsFromBoardResponse(response), 'board'))
      .catch((error) => {
        if (!isBoardApiUnavailable(error)) return fail(error);
        return ipcBridge.taskSession.list
          .invoke({})
          .then((list) => done(columnsFromTaskSessions(Array.isArray(list) ? list : []), 'legacy'))
          .catch(fail);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const interactive = source === 'board';
  // M8 Q12: one shared worktree per work item (branch on the card, details in the drawer).
  const { byItem: worktrees } = useWorkItemWorktrees(interactive && loadState === 'ready', refreshKey);
  const visibleLanes: TaskLane[] = showCancelled ? [...VISIBLE_LANES, 'cancelled'] : [...VISIBLE_LANES];
  const lanes = lanesFromColumns(columns);
  const dragItem = findBoardItem(columns, dragItemId);
  const selectedTask = findBoardItem(columns, selectedId);

  // E6-6: Inbox / share links open the drawer via `/tasks?task=<id>`.
  useEffect(() => {
    if (!deepLinkTask) return;
    if (loadState === 'ready') setSelectedId(deepLinkTask);
  }, [deepLinkTask, loadState]);

  // 3.0 sider "New ▾ → Import tasks" lands on `/tasks?import=github`.
  const importRequested = searchParams.get('import') === 'github';
  useEffect(() => {
    if (!importRequested || !interactive) return;
    setImportOpen(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('import');
        return next;
      },
      { replace: true }
    );
  }, [importRequested, interactive, setSearchParams]);

  useEffect(() => {
    const timers = pendingFallbacks.current;
    return () => {
      for (const { timer } of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  /** Mutation response: apply now; refetch later unless the push confirms it. */
  const applyServerItem = useCallback(
    (item: TaskBoardItem) => {
      setColumns((prev) => applyBoardItem(prev, item));
      const pending = pendingFallbacks.current;
      const previous = pending.get(item.id);
      if (previous) clearTimeout(previous.timer);
      const timer = setTimeout(() => {
        pending.delete(item.id);
        setRefreshKey((k) => k + 1);
        load(true);
      }, REALTIME_FALLBACK_MS);
      pending.set(item.id, { updatedAt: item.updated_at, timer });
    },
    [load]
  );

  useEffect(
    () =>
      ipcBridge.taskSession.board.updated.on((event) => {
        const item = event?.item;
        if (!item?.id) return;
        const pending = pendingFallbacks.current.get(item.id);
        if (pending && item.updated_at >= pending.updatedAt) {
          clearTimeout(pending.timer);
          pendingFallbacks.current.delete(item.id);
        }
        setColumns((prev) => applyBoardItem(prev, item));
      }),
    []
  );

  /** Optimistic-lock conflict: show the latest server state and let the user retry. */
  const handleStale = useCallback(() => {
    Message.warning(t('conversation.taskBoard.errors.stale'));
    setRefreshKey((k) => k + 1);
    load(true);
  }, [load, t]);

  const moveItem = useCallback(
    (item: TaskBoardItem, to: TaskBoardStatus) => {
      if (item.board_status === to || !canUserMoveBoardItem(item.board_status, to)) return;
      const from = item.board_status;
      setColumns((prev) => moveItemInColumns(prev, item.id, to));
      const updates: UpdateTaskBoardInput = {
        board_status: to as UpdateTaskBoardInput['board_status'],
        expected_updated_at: item.updated_at,
      };
      ipcBridge.taskSession.board.update
        .invoke({ id: item.id, updates })
        .then(applyServerItem)
        .catch((error) => {
          console.error('[TasksBoard] Move rejected:', error);
          setColumns((prev) => moveItemInColumns(prev, item.id, from));
          if (isBoardItemStale(error)) handleStale();
          else Message.error(t(boardErrorKey(error)));
        });
    },
    [applyServerItem, handleStale, t]
  );

  /** 3.0 C2: start a task (run slot or queue); the server copy replaces the card. */
  const startItem = useCallback(
    (item: TaskBoardItem) => {
      ipcBridge.taskSession.board.start
        .invoke({ id: item.id })
        .then((result) => {
          if (result?.item) applyServerItem(result.item);
          if (result?.state === 'queued' || result?.state === 'already_queued') {
            Message.info(t('conversation.taskBoard.flow.queued'));
          }
        })
        .catch((error) => {
          console.error('[TasksBoard] Start failed:', error);
          const detail = isBackendHttpError(error) && error.message ? error.message : '';
          Message.error(detail || t('conversation.taskBoard.flow.startFailed'));
        });
    },
    [applyServerItem, t]
  );

  const dropOnLane = useCallback(
    (item: TaskBoardItem, lane: TaskLane) => {
      const action = laneDropAction(item, lane);
      if (!action) return;
      if (action.kind === 'start') startItem(item);
      else moveItem(item, action.to);
    },
    [moveItem, startItem]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragItemId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragItemId(null);
      lastDragEndAt.current = Date.now();
      const to = event.over?.id as TaskLane | undefined;
      const item = findBoardItem(columns, String(event.active.id));
      if (item && to) dropOnLane(item, to);
    },
    [columns, dropOnLane]
  );

  const setView = useCallback(
    (next: 'board' | 'list') => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === 'list') params.set('view', 'list');
          else params.delete('view');
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const handleSelect = useCallback(
    (task: TaskBoardItem) => {
      if (Date.now() - lastDragEndAt.current < 300) return;
      setSelectedId(task.id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('task', task.id);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const clearTaskQuery = useCallback(() => {
    setSearchParams(
      (prev) => {
        if (!prev.has('task')) return prev;
        const next = new URLSearchParams(prev);
        next.delete('task');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const handleOpenConversation = useCallback(
    (conversationId: string) => {
      setSelectedId(null);
      clearTaskQuery();
      navigate(`/conversation/${conversationId}`);
    },
    [clearTaskQuery, navigate]
  );

  const handleCloseDrawer = useCallback(() => {
    setSelectedId(null);
    clearTaskQuery();
  }, [clearTaskQuery]);

  return (
    <div className='w-full h-full min-h-0 box-border bg-1 flex flex-col overflow-hidden' data-testid='tasks-board-page'>
      <div className={classNames('shrink-0 bg-1', isMobile ? 'px-16px pt-14px pb-10px' : 'px-40px pt-32px pb-12px')}>
        <SettingsPageHeader
          sticky={false}
          title={t('conversation.taskBoard.title')}
          description={t('conversation.taskBoard.description')}
          actions={
            <div className='flex items-center gap-12px'>
              <Radio.Group
                type='button'
                size='small'
                value={view}
                onChange={(value: 'board' | 'list') => setView(value)}
                data-testid='tasks-view-toggle'
              >
                <Radio value='board'>{t('conversation.taskBoard.flow.viewBoard')}</Radio>
                <Radio value='list'>{t('conversation.taskBoard.flow.viewList')}</Radio>
              </Radio.Group>
              <label className='flex items-center gap-6px text-13px text-t-secondary cursor-pointer'>
                <Switch
                  size='small'
                  checked={showCancelled}
                  onChange={setShowCancelled}
                  data-testid='tasks-board-show-cancelled'
                />
                {t('conversation.taskBoard.showCancelled')}
              </label>
              {interactive ? (
                <Button size='small' data-testid='tasks-board-github-import' onClick={() => setImportOpen(true)}>
                  {t('conversation.taskBoard.githubImport.open')}
                </Button>
              ) : null}
              <Button
                size='small'
                type='outline'
                data-testid='tasks-board-open-scheduled'
                onClick={() => navigate('/scheduled')}
              >
                {t('conversation.taskBoard.openScheduled', { defaultValue: 'Scheduled' })}
              </Button>
              <Button size='small' onClick={() => load()} loading={loadState === 'loading'}>
                {t('conversation.taskBoard.refresh')}
              </Button>
            </div>
          }
        />
        {source === 'legacy' ? (
          <Alert
            className='mt-12px'
            type='info'
            showIcon
            content={t('conversation.taskBoard.legacyNotice')}
            data-testid='tasks-board-legacy-notice'
          />
        ) : null}
      </div>

      {loadState === 'failed' ? (
        <div className='flex-1 flex flex-col items-center justify-center gap-12px' data-testid='tasks-board-failed'>
          <span className='text-t-secondary'>{t('conversation.taskBoard.loadFailed')}</span>
          <Button type='primary' onClick={() => load()}>
            {t('conversation.taskBoard.retry')}
          </Button>
        </div>
      ) : loadState === 'loading' && !hasData ? (
        <div className='flex-1 flex items-center justify-center'>
          <Spin />
        </div>
      ) : view === 'list' ? (
        <TaskListView
          lanes={lanes}
          visibleLanes={visibleLanes}
          interactive={interactive}
          isMobile={isMobile}
          worktrees={worktrees}
          onOpen={handleSelect}
          onStart={startItem}
        />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragItemId(null)}
        >
          <div
            className={classNames(
              'flex-1 min-h-0 flex gap-12px overflow-x-auto overflow-y-hidden box-border',
              isMobile ? 'px-16px pb-16px' : 'px-40px pb-24px'
            )}
          >
            {visibleLanes.map((lane) => (
              <DroppableLane key={lane} lane={lane} dragItem={dragItem}>
                <header className='shrink-0 flex items-center justify-between px-12px pt-10px pb-8px'>
                  <span className='text-13px font-medium text-t-primary'>
                    {t(`conversation.taskBoard.lanes.${lane}`)}
                  </span>
                  <span className='text-12px text-t-tertiary' data-testid={`tasks-board-lane-count-${lane}`}>
                    {lanes[lane].length}
                  </span>
                </header>
                <div className='flex-1 min-h-0 overflow-y-auto px-8px pb-8px flex flex-col gap-8px'>
                  {lanes[lane].length === 0 ? (
                    <Empty
                      className='py-16px'
                      description={t('conversation.taskBoard.emptyColumnHint', {
                        defaultValue: 'No work items here yet. Create a task or open Scheduled.',
                      })}
                    />
                  ) : (
                    lanes[lane].map((item) => (
                      <DraggableCard
                        key={item.id}
                        item={item}
                        disabled={!interactive || lane === 'done'}
                        onOpen={handleSelect}
                        onStart={interactive ? startItem : undefined}
                        worktree={worktrees.get(item.id) ?? null}
                      />
                    ))
                  )}
                </div>
              </DroppableLane>
            ))}
          </div>
        </DndContext>
      )}
      <TaskBoardDetailDrawer
        task={selectedTask}
        interactive={interactive}
        refreshKey={refreshKey}
        isMobile={isMobile}
        onClose={handleCloseDrawer}
        onOpenConversation={handleOpenConversation}
        onMove={moveItem}
        onItemUpdated={applyServerItem}
        onStale={handleStale}
        worktree={selectedTask ? (worktrees.get(selectedTask.id) ?? null) : null}
        onSquadStarted={() => setRefreshKey((k) => k + 1)}
      />
      <GithubIssueImportModal visible={importOpen} onClose={() => setImportOpen(false)} onImported={() => load(true)} />
    </div>
  );
};

export default TasksBoardPage;
