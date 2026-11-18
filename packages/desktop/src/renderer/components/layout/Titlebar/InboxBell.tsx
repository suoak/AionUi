/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Popover, Tooltip } from '@arco-design/web-react';
import { Remind } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type { IInboxItem } from '@/common/adapter/ipcBridge';
import { InboxPanel } from '@/renderer/components/layout/Sider/SiderNav/SiderInboxEntry';
import { inboxItemTarget } from '@/renderer/hooks/system/inbox/inboxItemTarget';
import { setInboxUnread, useInboxState } from '@/renderer/hooks/system/inbox/inboxStore';

type InboxBellProps = {
  iconSize: number;
  strokeWidth?: number;
};

const formatUnread = (n: number) => (n > 99 ? '99+' : String(n));

/**
 * 3.0 titlebar bell: the inbox (approvals, blocked, done, failed) moved out of the
 * sidebar. Hidden until Core answers `/api/inbox`, like the old sider entry.
 */
const InboxBell: React.FC<InboxBellProps> = ({ iconSize, strokeWidth }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
      const target = inboxItemTarget(item);
      if (target) {
        Promise.resolve(navigate(target)).catch((error) => console.error('Navigation failed:', error));
      }
    },
    [navigate]
  );

  if (support !== 'supported') return null;

  const tooltip = t('common.inbox.tooltip', { count: unread });
  return (
    <Popover
      trigger='click'
      position='br'
      popupVisible={open}
      onVisibleChange={setOpen}
      content={<InboxPanel open={open} revision={revision} onOpenItem={onOpenItem} />}
    >
      <span className='inline-flex'>
        <Tooltip content={tooltip} position='bottom' disabled={open} mini>
          <Button
            type='text'
            data-testid='titlebar-inbox-bell'
            aria-label={tooltip}
            className='app-titlebar__button relative !p-0 !min-w-0 !text-t-primary'
          >
            <Remind theme='outline' size={iconSize} fill='currentColor' strokeWidth={strokeWidth} />
            {unread > 0 && (
              <span
                data-testid='titlebar-inbox-unread'
                className='absolute top-2px end-0 min-w-14px h-14px px-3px box-border rd-7px bg-wm-status-needs-you text-wm-on-accent text-10px leading-14px text-center font-600'
              >
                {formatUnread(unread)}
              </span>
            )}
          </Button>
        </Tooltip>
      </span>
    </Popover>
  );
};

export default InboxBell;
