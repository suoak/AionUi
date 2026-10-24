/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import { Alert, Button, Empty, Message, Spin, Switch } from '@arco-design/web-react';
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
import type { TaskBoardItem, TaskBoardStatus, UpdateTaskBoardInput } from '@/common/types/agent/taskSession';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import SettingsPageHeader from '@/renderer/pages/settings/components/SettingsPageHeader';
import TaskBoardCard from './TaskBoardCard';
import TaskBoardDetailDrawer from './TaskBoardDetailDrawer';
import {
  VISIBLE_BOARD_COLUMNS,
  boardErrorKey,
  canUserMoveBoardItem,
  columnsFromBoardResponse,
  columnsFromTaskSessions,
  findBoardItem,
  isBoardApiUnavailable,
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
}> = ({ item, disabled, onOpen }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { from: item.board_status },
    disabled,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} role={undefined} tabIndex={undefined}>
      <TaskBoardCard task={item} onOpen={onOpen} dragging={isDragging} />
    </div>
  );
};

const DroppableColumn: React.FC<{
  status: TaskBoardStatus;
  /** Column the active card came from, while dragging. */
  dragFrom: TaskBoardStatus | null;
  children: React.ReactNode;
}> = ({ status, dragFrom, children }) => {
  const allowed = dragFrom !== null && canUserMoveBoardItem(dragFrom, status);
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: dragFrom !== null && !allowed });
  return (
    <section
      ref={setNodeRef}
      data-testid={`tasks-board-column-${status}`}
      data-drop-allowed={dragFrom === null ? undefined : String(allowed)}
      className={classNames(
        'shrink-0 w-260px min-h-0 flex flex-col rd-10px bg-fill-1 box-border border-2 border-solid border-transparent',
        dragFrom !== null && dragFrom !== status && !allowed && 'opacity-50',
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
 */
const TasksBoardPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useLayoutContext()?.isMobile ?? false;
  const [columns, setColumns] = useState<BoardItemColumns>(EMPTY_COLUMNS);
  const [source, setSource] = useState<DataSource>('board');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [hasData, setHasData] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<TaskBoardStatus | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const loadSeq = useRef(0);
  // The pointer-up that ends a drag also clicks the card; ignore that click.
  const lastDragEndAt = useRef(0);

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
  const visibleColumns: TaskBoardStatus[] = showCancelled
    ? [...VISIBLE_BOARD_COLUMNS, 'cancelled']
    : [...VISIBLE_BOARD_COLUMNS];
  const selectedTask = findBoardItem(columns, selectedId);

  const applyServerItem = useCallback(
    (item: TaskBoardItem) => {
      setColumns((prev) => moveItemInColumns(prev, item.id, item.board_status, item));
      setRefreshKey((k) => k + 1);
      load(true);
    },
    [load]
  );

  const moveItem = useCallback(
    (item: TaskBoardItem, to: TaskBoardStatus) => {
      if (item.board_status === to || !canUserMoveBoardItem(item.board_status, to)) return;
      const from = item.board_status;
      setColumns((prev) => moveItemInColumns(prev, item.id, to));
      const updates: UpdateTaskBoardInput = { board_status: to as UpdateTaskBoardInput['board_status'] };
      ipcBridge.taskSession.board.update
        .invoke({ id: item.id, updates })
        .then(applyServerItem)
        .catch((error) => {
          console.error('[TasksBoard] Move rejected:', error);
          setColumns((prev) => moveItemInColumns(prev, item.id, from));
          Message.error(t(boardErrorKey(error)));
        });
    },
    [applyServerItem, t]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const from = (event.active.data.current as { from?: TaskBoardStatus } | undefined)?.from ?? null;
    setDragFrom(from);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragFrom(null);
      lastDragEndAt.current = Date.now();
      const to = event.over?.id as TaskBoardStatus | undefined;
      const item = findBoardItem(columns, String(event.active.id));
      if (item && to) moveItem(item, to);
    },
    [columns, moveItem]
  );

  const handleSelect = useCallback((task: TaskBoardItem) => {
    if (Date.now() - lastDragEndAt.current < 300) return;
    setSelectedId(task.id);
  }, []);

  const handleOpenConversation = useCallback(
    (conversationId: string) => {
      setSelectedId(null);
      navigate(`/conversation/${conversationId}`);
    },
    [navigate]
  );

  return (
    <div className='w-full h-full min-h-0 box-border bg-1 flex flex-col overflow-hidden' data-testid='tasks-board-page'>
      <div className={classNames('shrink-0 bg-1', isMobile ? 'px-16px pt-14px pb-10px' : 'px-40px pt-32px pb-12px')}>
        <SettingsPageHeader
          sticky={false}
          title={t('conversation.taskBoard.title')}
          description={t('conversation.taskBoard.description')}
          actions={
            <div className='flex items-center gap-12px'>
              <label className='flex items-center gap-6px text-13px text-t-secondary cursor-pointer'>
                <Switch
                  size='small'
                  checked={showCancelled}
                  onChange={setShowCancelled}
                  data-testid='tasks-board-show-cancelled'
                />
                {t('conversation.taskBoard.showCancelled')}
              </label>
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
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragFrom(null)}
        >
          <div
            className={classNames(
              'flex-1 min-h-0 flex gap-12px overflow-x-auto overflow-y-hidden box-border',
              isMobile ? 'px-16px pb-16px' : 'px-40px pb-24px'
            )}
          >
            {visibleColumns.map((status) => (
              <DroppableColumn key={status} status={status} dragFrom={dragFrom}>
                <header className='shrink-0 flex items-center justify-between px-12px pt-10px pb-8px'>
                  <span className='text-13px font-medium text-t-primary'>
                    {t(`conversation.taskBoard.columns.${status}`)}
                  </span>
                  <span className='text-12px text-t-tertiary' data-testid={`tasks-board-column-count-${status}`}>
                    {columns[status].length}
                  </span>
                </header>
                <div className='flex-1 min-h-0 overflow-y-auto px-8px pb-8px flex flex-col gap-8px'>
                  {columns[status].length === 0 ? (
                    <Empty className='py-16px' description={t('conversation.taskBoard.emptyColumn')} />
                  ) : (
                    columns[status].map((item) => (
                      <DraggableCard
                        key={item.id}
                        item={item}
                        disabled={!interactive || status === 'done'}
                        onOpen={handleSelect}
                      />
                    ))
                  )}
                </div>
              </DroppableColumn>
            ))}
          </div>
        </DndContext>
      )}
      <TaskBoardDetailDrawer
        task={selectedTask}
        interactive={interactive}
        refreshKey={refreshKey}
        isMobile={isMobile}
        onClose={() => setSelectedId(null)}
        onOpenConversation={handleOpenConversation}
        onMove={moveItem}
        onItemUpdated={applyServerItem}
      />
    </div>
  );
};

export default TasksBoardPage;
