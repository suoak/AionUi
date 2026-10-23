/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, Tooltip } from '@arco-design/web-react';
import { Inbox } from '@icon-park/react';
import classNames from 'classnames';
import { ipcBridge } from '@/common';
import type { IInboxItem } from '@/common/adapter/ipcBridge';
import { setInboxUnread, useInboxState } from '@/renderer/hooks/system/inbox/inboxStore';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

type SiderInboxEntryProps = {
  isMobile: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  /** Jump to the item's source conversation. */
  onOpenConversation: (conversationId: string) => void;
};

const KIND_COLOR: Record<string, string> = {
  approval: 'text-[rgb(var(--warning-6))]',
  blocked: 'text-[rgb(var(--danger-6))]',
  failed: 'text-[rgb(var(--danger-6))]',
  completed: 'text-[rgb(var(--success-6))]',
};

const formatUnread = (n: number) => (n > 99 ? '99+' : String(n));

export const InboxPanel: React.FC<{
  open: boolean;
  revision: number;
  onOpenItem: (item: IInboxItem) => void;
}> = ({ open, revision, onOpenItem }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<IInboxItem[]>([]);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    Promise.resolve()
      .then(() => ipcBridge.inbox.list.invoke({ limit: 30 }))
      .then((res) => {
        setItems(res?.items ?? []);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, revision, load]);

  const markAll = () => {
    Promise.resolve()
      .then(() => ipcBridge.inbox.markAllRead.invoke())
      .then((res) => {
        setInboxUnread(res?.unread_count ?? 0);
        load();
      })
      .catch(() => setError(true));
  };

  return (
    <div className='w-320px max-h-420px flex flex-col' data-testid='inbox-panel'>
      <div className='flex items-center justify-between px-12px py-8px border-b border-b-solid border-[var(--color-border-2)]'>
        <span className='text-14px font-[500] text-t-primary'>{t('common.inbox.title')}</span>
        <span
          className='text-12px text-[rgb(var(--primary-6))] cursor-pointer hover:underline'
          data-testid='inbox-mark-all'
          onClick={markAll}
        >
          {t('common.inbox.markAllRead')}
        </span>
      </div>
      <div className='flex-1 min-h-0 overflow-y-auto'>
        {error ? (
          <div className='px-12px py-16px text-12px text-t-tertiary'>{t('common.inbox.loadFailed')}</div>
        ) : items.length === 0 ? (
          <div className='px-12px py-16px text-12px text-t-tertiary' data-testid='inbox-empty'>
            {t('common.inbox.empty')}
          </div>
        ) : (
          items.map((item) => {
            const unread = !item.read_at;
            return (
              <div
                key={item.id}
                data-testid='inbox-item'
                data-unread={unread ? 'true' : 'false'}
                className='px-12px py-8px cursor-pointer hover:bg-fill-2 flex flex-col gap-2px'
                onClick={() => onOpenItem(item)}
              >
                <div className='flex items-center gap-6px min-w-0'>
                  {unread && <span className='size-6px rd-full bg-[rgb(var(--primary-6))] shrink-0' />}
                  <span className={classNames('text-12px shrink-0', KIND_COLOR[item.kind] ?? 'text-t-secondary')}>
                    {item.resolved_at && item.kind === 'approval'
                      ? t('common.inbox.resolved')
                      : t(`common.inbox.kind.${item.kind}`, { defaultValue: item.kind })}
                  </span>
                  <span
                    className={classNames(
                      'min-w-0 flex-1 truncate text-13px',
                      unread ? 'text-t-primary font-[500]' : 'text-t-secondary'
                    )}
                  >
                    {item.title}
                  </span>
                </div>
                {item.summary && <div className='text-12px text-t-tertiary truncate'>{item.summary}</div>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

/**
 * Sider entry for the M7 E5-4 inbox. Hidden until Core answers `/api/inbox`
 * (older cores return 404 → the entry never renders).
 */
const SiderInboxEntry: React.FC<SiderInboxEntryProps> = ({
  isMobile,
  collapsed,
  siderTooltipProps,
  onOpenConversation,
}) => {
  const { t } = useTranslation();
  const { support, unread, revision } = useInboxState();
  const [open, setOpen] = useState(false);

  const onOpenItem = useCallback(
    (item: IInboxItem) => {
      setOpen(false);
      if (!item.read_at) {
        Promise.resolve()
          .then(() => ipcBridge.inbox.markRead.invoke({ id: item.id }))
          .then((res) => {
            if (res) setInboxUnread(res.unread_count);
          })
          .catch(() => {});
      }
      if (item.conversation_id) onOpenConversation(item.conversation_id);
    },
    [onOpenConversation]
  );

  if (support !== 'supported') return null;

  const tooltip = t('common.inbox.tooltip', { count: unread });
  const badge =
    unread > 0 ? (
      <span
        data-testid='sider-inbox-unread'
        className={classNames(
          'shrink-0 min-w-16px h-16px px-4px rd-8px bg-[rgb(var(--danger-6))] text-white text-11px leading-16px text-center',
          collapsed && 'absolute -top-2px -right-2px'
        )}
      >
        {formatUnread(unread)}
      </span>
    ) : null;

  const trigger = collapsed ? (
    <div
      data-testid='sider-inbox-entry'
      className={classNames(
        'relative w-full h-34px flex items-center justify-center cursor-pointer transition-colors rd-8px text-t-primary',
        open ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
      )}
    >
      <Inbox theme='outline' size='20' fill='currentColor' className='block leading-none shrink-0' />
      {badge}
    </div>
  ) : (
    <div
      data-testid='sider-inbox-entry'
      className={classNames(
        'box-border group h-34px w-full flex items-center justify-start gap-8px pl-10px pr-8px rd-0.5rem cursor-pointer shrink-0 transition-all text-t-primary',
        isMobile && 'sider-action-btn-mobile',
        open ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
      )}
    >
      <span className='size-22px flex items-center justify-center shrink-0 text-t-primary'>
        <Inbox theme='outline' size='16' fill='currentColor' className='block leading-none' />
      </span>
      <span className='collapsed-hidden min-w-0 flex-1 truncate text-t-primary text-14px font-[500] leading-24px'>
        {t('common.inbox.title')}
      </span>
      {badge}
    </div>
  );

  return (
    <Popover
      trigger='click'
      position='right'
      popupVisible={open}
      onVisibleChange={setOpen}
      content={<InboxPanel open={open} revision={revision} onOpenItem={onOpenItem} />}
    >
      <span className='block w-full'>
        <Tooltip {...siderTooltipProps} content={tooltip} position='right' disabled={open}>
          {trigger}
        </Tooltip>
      </span>
    </Popover>
  );
};

export default SiderInboxEntry;
