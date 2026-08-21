import type {
  ConversationCommandQueueItem,
  ConversationCommandQueueMode,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { restrictToVerticalAxis } from '@/renderer/utils/ui/dndModifiers';
import {
  type Modifier,
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Dropdown, Menu, Modal, Tooltip, Typography } from '@arco-design/web-react';
import { CornerDownRight, Delete, Drag, Edit, Inbox, MoreOne, Refresh, SendOne, SortTwo } from '@icon-park/react';
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const getCommandPreview = (input: string): string => input.replace(/\s+/g, ' ').trim();

const QUEUE_STATUS_KEYS = {
  held: 'conversation.commandQueue.statusHeld',
  dispatching: 'conversation.commandQueue.statusDispatching',
  accepted: 'conversation.commandQueue.statusAccepted',
  applied: 'conversation.commandQueue.statusApplied',
  canceled: 'conversation.commandQueue.statusCanceled',
  failed: 'conversation.commandQueue.statusFailed',
} as const;

const canCancelQueueItem = (item: ConversationCommandQueueItem): boolean =>
  !item.status || item.status === 'held' || item.status === 'dispatching' || item.status === 'accepted';

const createRestrictToQueueContainerModifier = (
  queueContainerRef: React.RefObject<HTMLDivElement | null>
): Modifier => {
  return ({ draggingNodeRect, overlayNodeRect, transform }) => {
    const queueContainerRect = queueContainerRef.current?.getBoundingClientRect();
    const activeRect = overlayNodeRect ?? draggingNodeRect;

    if (!queueContainerRect || !activeRect) {
      return transform;
    }

    const minY = queueContainerRect.top - activeRect.top;
    const maxY = queueContainerRect.bottom - (activeRect.top + activeRect.height);

    return {
      ...transform,
      y: Math.min(Math.max(transform.y, minY), maxY),
    };
  };
};

type QueueItemVariant = 'pending' | 'recent';

type CommandQueuePanelProps = {
  items: ConversationCommandQueueItem[];
  recentItems?: ConversationCommandQueueItem[];
  mode: ConversationCommandQueueMode;
  interactionLocked: boolean;
  isMobile?: boolean;
  onInteractionLock: () => void;
  onInteractionUnlock: () => void;
  onUpdate?: (commandId: string, input: string) => boolean;
  onEdit?: (item: ConversationCommandQueueItem) => void;
  onSendNow: (item: ConversationCommandQueueItem) => void;
  onToggleMode: () => void;
  onReorder: (activeCommandId: string, overCommandId: string) => void;
  onRemove: (commandId: string) => void;
  onRetry?: (commandId: string) => void;
  onClear: () => void;
};

type RenderActionIconButtonArgs = {
  ariaLabel: string;
  disabled?: boolean;
  onClick?: () => void;
  icon: React.ReactNode;
  danger?: boolean;
  accent?: boolean;
};

type SortableQueueItemProps = {
  item: ConversationCommandQueueItem;
  dragDisabled: boolean;
  dragViaCard: boolean;
  dragHandleLabel: string;
  preview: string;
  fileCountLabel: string | null;
  t: (key: string, options?: Record<string, unknown>) => string;
  onEdit?: (item: ConversationCommandQueueItem) => void;
  onSendNow: (item: ConversationCommandQueueItem) => void;
  onRemove: (commandId: string) => void;
  onRetry?: (commandId: string) => void;
  onDragHandlePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

type QueueItemCardProps = {
  item: ConversationCommandQueueItem;
  variant?: QueueItemVariant;
  isDragging: boolean;
  dragDisabled: boolean;
  dragViaCard: boolean;
  dragHandleLabel: string;
  preview: string;
  fileCountLabel: string | null;
  t: (key: string, options?: Record<string, unknown>) => string;
  onEdit?: (item: ConversationCommandQueueItem) => void;
  onSendNow: (item: ConversationCommandQueueItem) => void;
  onRemove: (commandId: string) => void;
  onRetry?: (commandId: string) => void;
  onDragHandlePointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  dragHandleButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  dragHandleRef?: (element: HTMLButtonElement | null) => void;
  cardDragListeners?: React.HTMLAttributes<HTMLDivElement>;
  cardDragRef?: (element: HTMLElement | null) => void;
};

const renderQueueActionIconButton = ({
  ariaLabel,
  disabled = false,
  onClick,
  icon,
  danger = false,
  accent = false,
}: RenderActionIconButtonArgs) => (
  <Button
    size='mini'
    type='text'
    shape='circle'
    className='w-24px h-24px min-w-24px p-0 opacity-72 hover:opacity-100'
    disabled={disabled}
    status={danger ? 'danger' : 'default'}
    aria-label={ariaLabel}
    title={ariaLabel}
    onClick={onClick}
  >
    <span
      className='inline-flex items-center justify-center'
      style={{
        color: danger
          ? 'rgb(var(--danger-6))'
          : accent
            ? 'rgb(var(--primary-6))'
            : disabled
              ? 'var(--color-text-4)'
              : 'var(--color-text-3)',
      }}
    >
      {icon}
    </span>
  </Button>
);

const QueueItemCard: React.FC<QueueItemCardProps> = ({
  item,
  variant = 'pending',
  isDragging,
  dragDisabled,
  dragViaCard,
  dragHandleLabel,
  preview,
  fileCountLabel,
  t,
  onEdit,
  onSendNow,
  onRemove,
  onRetry,
  onDragHandlePointerDown,
  dragHandleButtonProps,
  dragHandleRef,
  cardDragListeners,
  cardDragRef,
}) => {
  const { onPointerDown: onSortableDragHandlePointerDown, ...restDragHandleButtonProps } = dragHandleButtonProps ?? {};
  const isRecent = variant === 'recent';
  return (
    <div
      {...(dragViaCard && !isRecent ? cardDragListeners : {})}
      ref={dragViaCard && !isRecent ? cardDragRef : undefined}
      className='group flex items-center justify-between gap-6px rd-10px px-8px py-5px transition-[background-color,opacity] duration-180 ease-out'
      data-command-id={item.id}
      data-queue-variant={variant}
      data-sortable={isRecent || dragDisabled ? 'disabled' : 'enabled'}
      aria-grabbed={isDragging}
      aria-label={preview}
      style={{
        background: isDragging
          ? 'color-mix(in srgb, var(--color-fill-2) 88%, var(--color-bg-1))'
          : 'color-mix(in srgb, var(--color-fill-1) 76%, transparent)',
        touchAction: dragViaCard && !dragDisabled && !isRecent ? 'none' : undefined,
      }}
    >
      <div className='flex items-center gap-6px min-w-0 flex-1 relative pl-8px'>
        <div className='flex items-center gap-5px w-18px shrink-0 relative'>
          {isRecent ? null : (
            <button
              {...restDragHandleButtonProps}
              ref={dragHandleRef}
              type='button'
              aria-label={dragHandleLabel}
              disabled={dragDisabled}
              data-drag-handle={dragDisabled ? 'disabled' : 'enabled'}
              data-floating-handle='visible'
              className={`absolute inline-flex h-16px w-12px items-center justify-center border-none bg-transparent p-0 outline-none transition-[opacity,color] duration-160 ease-out ${
                dragDisabled
                  ? 'cursor-default opacity-0'
                  : isDragging
                    ? 'cursor-grabbing opacity-100'
                    : 'cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
              }`}
              style={{
                left: '-15px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-3)',
                touchAction: dragDisabled ? undefined : 'none',
              }}
              onPointerDown={(event) => {
                onDragHandlePointerDown?.(event);
                onSortableDragHandlePointerDown?.(event);
              }}
            >
              <Drag theme='outline' size='12' strokeWidth={2.5} />
            </button>
          )}
          <span
            aria-hidden='true'
            data-queue-arrow='true'
            className='inline-flex h-16px w-16px items-center justify-center shrink-0'
            style={{
              color: 'var(--color-text-3)',
            }}
          >
            <CornerDownRight theme='outline' size='12' strokeWidth={2.3} />
          </span>
        </div>
        <div className='min-w-0 flex-1 flex items-center gap-6px'>
          <Typography.Ellipsis rows={1} showTooltip className='min-w-0 flex-1 text-11px leading-16px text-t-secondary'>
            {preview}
          </Typography.Ellipsis>
          {fileCountLabel ? (
            <span
              className='inline-flex items-center rd-999px px-5px py-1px text-9px leading-none shrink-0'
              style={{
                color: 'var(--color-text-3)',
                background: 'color-mix(in srgb, var(--color-fill-2) 72%, transparent)',
              }}
            >
              {fileCountLabel}
            </span>
          ) : null}
          {item.status ? (
            <span className='shrink-0 text-9px text-t-secondary' title={item.error_code}>
              {t(QUEUE_STATUS_KEYS[item.status], { defaultValue: item.status })}
            </span>
          ) : null}
        </div>
      </div>
      <div className='flex items-center gap-0.5 shrink-0'>
        {item.status === 'failed'
          ? renderQueueActionIconButton({
              ariaLabel: t('conversation.commandQueue.retry', { defaultValue: 'Retry' }),
              onClick: () => onRetry?.(item.id),
              icon: <Refresh theme='outline' size='14' strokeWidth={2.5} />,
              accent: true,
            })
          : null}
        {isRecent
          ? null
          : renderQueueActionIconButton({
              ariaLabel: t('conversation.commandQueue.sendNow', { defaultValue: 'Send now' }),
              disabled: item.managed_by_server,
              onClick: item.managed_by_server ? undefined : () => onSendNow(item),
              icon: <SendOne theme='outline' size='14' strokeWidth={2.5} />,
              accent: true,
            })}
        {isRecent
          ? null
          : renderQueueActionIconButton({
              ariaLabel: t('conversation.commandQueue.edit', { defaultValue: 'Edit' }),
              disabled: item.managed_by_server,
              onClick: item.managed_by_server ? undefined : () => onEdit?.(item),
              icon: <Edit theme='outline' size='14' strokeWidth={2.5} />,
            })}
        {isRecent
          ? null
          : renderQueueActionIconButton({
              ariaLabel: t('conversation.commandQueue.remove', { defaultValue: 'Remove' }),
              disabled: !canCancelQueueItem(item),
              onClick: canCancelQueueItem(item) ? () => onRemove(item.id) : undefined,
              icon: <Delete theme='outline' size='14' strokeWidth={2.5} />,
              danger: true,
            })}
      </div>
    </div>
  );
};

const SortableQueueItem: React.FC<SortableQueueItemProps> = ({
  item,
  dragDisabled,
  dragViaCard,
  dragHandleLabel,
  preview,
  fileCountLabel,
  t,
  onEdit,
  onSendNow,
  onRemove,
  onRetry,
  onDragHandlePointerDown,
}) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: dragDisabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.58 : 1,
    zIndex: isDragging ? 2 : undefined,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <QueueItemCard
        item={item}
        isDragging={isDragging}
        dragDisabled={dragDisabled}
        dragViaCard={dragViaCard}
        dragHandleLabel={dragHandleLabel}
        preview={preview}
        fileCountLabel={fileCountLabel}
        t={t}
        onEdit={onEdit}
        onSendNow={onSendNow}
        onRemove={onRemove}
        onRetry={onRetry}
        onDragHandlePointerDown={onDragHandlePointerDown}
        dragHandleRef={dragViaCard ? undefined : setActivatorNodeRef}
        dragHandleButtonProps={
          dragViaCard
            ? {}
            : {
                ...(attributes as React.ButtonHTMLAttributes<HTMLButtonElement>),
                ...(listeners as React.ButtonHTMLAttributes<HTMLButtonElement>),
              }
        }
        cardDragRef={dragViaCard ? setActivatorNodeRef : undefined}
        cardDragListeners={
          dragViaCard
            ? {
                ...(attributes as React.HTMLAttributes<HTMLDivElement>),
                ...(listeners as React.HTMLAttributes<HTMLDivElement>),
              }
            : undefined
        }
      />
    </div>
  );
};

const CommandQueuePanel: React.FC<CommandQueuePanelProps> = ({
  items,
  recentItems = [],
  mode,
  interactionLocked,
  isMobile = false,
  onInteractionLock,
  onInteractionUnlock,
  onEdit,
  onSendNow,
  onToggleMode,
  onReorder,
  onRemove,
  onRetry,
  onClear,
}) => {
  const { t } = useTranslation();
  // Applied inputs belong in the transcript, not the draft box. Filter here so a
  // stale prop cannot resurrect a successfully sent message as a "recent" draft.
  const visibleRecentItems = useMemo(() => recentItems.filter((item) => item.status !== 'applied'), [recentItems]);
  const queueContainerRef = useRef<HTMLDivElement | null>(null);
  const activeDragHandleRef = useRef<HTMLButtonElement | null>(null);
  // Desktop: drag starts after moving 8px from the handle.
  // Narrow / mobile: no handle, so long-press the whole row (200ms) starts the drag;
  // the delay keeps a normal tap on the action buttons from being read as a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: isMobile ? { delay: 200, tolerance: 6 } : { distance: 8 },
    })
  );

  const clearDragHandleFocus = () => {
    activeDragHandleRef.current?.blur();
    activeDragHandleRef.current = null;
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    onInteractionUnlock();
    clearDragHandleFocus();

    if (!over || active.id === over.id) {
      return;
    }

    onReorder(String(active.id), String(over.id));
  };

  const handleDragStart = () => {
    if (interactionLocked) {
      return;
    }

    onInteractionLock();
  };

  const handleDragCancel = () => {
    onInteractionUnlock();
    clearDragHandleFocus();
  };

  const dragHandleLabel = t('conversation.commandQueue.reorder', {
    defaultValue: 'Drag to reorder queued command',
  });
  const dragModifiers = useMemo(
    () => [restrictToVerticalAxis, createRestrictToQueueContainerModifier(queueContainerRef)],
    []
  );

  const title = t('conversation.commandQueue.title', { defaultValue: 'Send draft box' });
  const modeLabel =
    mode === 'auto'
      ? t('conversation.commandQueue.mode.auto', { defaultValue: 'Auto' })
      : t('conversation.commandQueue.mode.manual', { defaultValue: 'Manual' });

  const helpContent = (
    <div className='flex flex-col gap-6px max-w-260px text-12px leading-18px'>
      <span>
        {t('conversation.commandQueue.helpIntro', {
          defaultValue: 'Messages you send while the AI is replying wait here.',
        })}
      </span>
      <span>
        <b>{t('conversation.commandQueue.mode.auto', { defaultValue: 'Auto' })}</b>
        {t('conversation.commandQueue.helpAuto', {
          defaultValue: ': sent automatically one by one after each reply finishes.',
        })}
      </span>
      <span>
        <b>{t('conversation.commandQueue.mode.manual', { defaultValue: 'Manual' })}</b>
        {t('conversation.commandQueue.helpManual', {
          defaultValue: ': kept here without sending; use Send now on each.',
        })}
      </span>
    </div>
  );

  const handleClear = () => {
    Modal.confirm({
      title: t('conversation.commandQueue.clearConfirmTitle', { defaultValue: 'Clear the send draft box?' }),
      content: t('conversation.commandQueue.clearConfirmContent', {
        defaultValue: 'All pending messages will be removed. This cannot be undone.',
      }),
      okButtonProps: { status: 'danger' },
      okText: t('conversation.commandQueue.clear', { defaultValue: 'Clear draft box' }),
      onOk: onClear,
    });
  };

  if (items.length === 0 && visibleRecentItems.length === 0) {
    return null;
  }

  const moreMenu = (
    <Menu>
      {isMobile ? (
        <Menu.Item
          key='help'
          style={{
            maxWidth: 260,
            whiteSpace: 'normal',
            height: 'auto',
            lineHeight: '18px',
            paddingTop: 8,
            paddingBottom: 8,
          }}
        >
          {helpContent}
        </Menu.Item>
      ) : null}
      <Menu.Item key='clear' onClick={handleClear} style={{ color: 'rgb(var(--danger-6))' }}>
        {t('conversation.commandQueue.clear', { defaultValue: 'Clear draft box' })}
      </Menu.Item>
    </Menu>
  );

  return (
    <div className='relative z-1 mb--12px px-8px pt-8px pb-12px'>
      <div
        aria-label={title}
        className='overflow-hidden rd-t-18px border b-solid'
        style={{
          borderColor: 'color-mix(in srgb, var(--color-border-2) 56%, transparent)',
          background: 'color-mix(in srgb, var(--color-fill-1) 84%, var(--color-bg-1))',
        }}
      >
        <div className='flex items-center justify-between gap-8px px-12px pt-8px pb-4px'>
          <div className='flex items-center gap-6px min-w-0 leading-none'>
            {isMobile ? (
              <Tooltip content={title} position='top'>
                <span className='inline-flex items-center justify-center text-t-tertiary' aria-label={title}>
                  <Inbox theme='outline' size='16' strokeWidth={2.4} />
                </span>
              </Tooltip>
            ) : (
              <span className='inline-flex items-center text-12px font-600 text-t-secondary whitespace-nowrap leading-none'>
                {title}
              </span>
            )}
            <span
              className='inline-flex items-center justify-center rd-999px px-6px h-16px text-10px leading-none font-600'
              style={{ background: 'var(--color-fill-3)', color: 'var(--color-text-2)' }}
            >
              {items.length + visibleRecentItems.length}
            </span>
          </div>
          <div className='flex items-center gap-4px shrink-0'>
            {/* The mode toggle doubles as the help affordance: hovering it shows what
                Auto vs Manual mean, so no separate "?" button is needed. */}
            <Tooltip content={helpContent} position='top'>
              <Button
                size='mini'
                type='text'
                shape='round'
                className='h-24px px-9px'
                aria-label={t('conversation.commandQueue.modeToggle', { defaultValue: 'Toggle send mode' })}
                onClick={onToggleMode}
                style={{
                  background: mode === 'auto' ? 'rgb(var(--primary-1))' : 'var(--color-fill-2)',
                  color: mode === 'auto' ? 'rgb(var(--primary-6))' : 'var(--color-text-2)',
                  fontWeight: 600,
                }}
              >
                <span className='inline-flex items-center gap-4px text-11px'>
                  {modeLabel}
                  <SortTwo theme='outline' size='12' strokeWidth={3} style={{ opacity: 0.7 }} />
                </span>
              </Button>
            </Tooltip>
            {items.length > 0 ? (
              <Dropdown trigger='click' droplist={moreMenu} position='br'>
                <Button
                  size='mini'
                  type='text'
                  shape='circle'
                  className='w-22px h-22px min-w-22px p-0 opacity-72 hover:opacity-100 flex items-center justify-center'
                  aria-label={t('conversation.commandQueue.moreActions', { defaultValue: 'More actions' })}
                >
                  <span
                    className='inline-flex items-center justify-center leading-none'
                    style={{ color: 'var(--color-text-3)', fontSize: 0 }}
                  >
                    <MoreOne theme='outline' size='15' strokeWidth={2.5} />
                  </span>
                </Button>
              </Dropdown>
            ) : null}
          </div>
        </div>
        {items.length > 0 ? (
          <div className='flex flex-col'>
            {visibleRecentItems.length > 0 ? (
              <div className='px-12px pb-2px text-10px font-600 text-t-tertiary'>
                {t('conversation.commandQueue.pendingSection', { defaultValue: 'Pending' })}
              </div>
            ) : null}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              modifiers={dragModifiers}
            >
              <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <div
                  ref={queueContainerRef}
                  data-command-queue-list='true'
                  data-drag-axis='vertical'
                  data-drag-bounds='queue'
                  className='p-6px flex flex-col gap-4px'
                >
                  {items.map((item) => {
                    const preview = getCommandPreview(item.input);
                    const fileCountLabel =
                      item.files.length > 0
                        ? t('conversation.commandQueue.files', {
                            count: item.files.length,
                            defaultValue: `${item.files.length} files`,
                          })
                        : null;

                    return (
                      <SortableQueueItem
                        key={item.id}
                        item={item}
                        dragDisabled={Boolean(item.managed_by_server)}
                        dragViaCard={isMobile}
                        dragHandleLabel={dragHandleLabel}
                        preview={preview}
                        fileCountLabel={fileCountLabel}
                        t={t}
                        onEdit={onEdit}
                        onSendNow={onSendNow}
                        onRemove={onRemove}
                        onRetry={onRetry}
                        onDragHandlePointerDown={(event) => {
                          activeDragHandleRef.current = event.currentTarget;
                        }}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        ) : null}
        {visibleRecentItems.length > 0 ? (
          <div data-testid='command-queue-recent' className='flex flex-col'>
            <div className='px-12px pb-2px text-10px font-600 text-t-tertiary'>
              {t('conversation.commandQueue.recentSection', { defaultValue: 'Recent' })}
            </div>
            <div className='p-6px flex flex-col gap-4px' data-command-queue-recent-list='true'>
              {visibleRecentItems.map((item) => {
                const preview = getCommandPreview(item.input);
                const fileCountLabel =
                  item.files.length > 0
                    ? t('conversation.commandQueue.files', {
                        count: item.files.length,
                        defaultValue: `${item.files.length} files`,
                      })
                    : null;

                return (
                  <QueueItemCard
                    key={item.id}
                    item={item}
                    variant='recent'
                    isDragging={false}
                    dragDisabled
                    dragViaCard={false}
                    dragHandleLabel={dragHandleLabel}
                    preview={preview}
                    fileCountLabel={fileCountLabel}
                    t={t}
                    onSendNow={onSendNow}
                    onRemove={onRemove}
                    onRetry={onRetry}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CommandQueuePanel;
