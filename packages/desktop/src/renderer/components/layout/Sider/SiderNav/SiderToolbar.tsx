/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Down, Github, ListCheckbox, Plus } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import styles from '../Sider.module.css';

interface SiderToolbarProps {
  isMobile: boolean;
  isBatchMode: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onNewChat: () => void;
  onToggleBatchMode: () => void;
  /** 3.0 "New ▾": import GitHub issues as tasks. */
  onImportTasks?: () => void;
}

const SiderToolbar: React.FC<SiderToolbarProps> = ({
  isMobile,
  isBatchMode,
  collapsed,
  siderTooltipProps,
  onNewChat,
  onToggleBatchMode,
  onImportTasks,
}) => {
  const { t } = useTranslation();

  const newMenu = (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'new-chat') onNewChat();
        else if (key === 'import-tasks') onImportTasks?.();
        else if (key === 'batch-manage') onToggleBatchMode();
      }}
    >
      <Menu.Item key='new-chat' data-testid='sider-new-menu-chat'>
        <span className='inline-flex items-center gap-8px'>
          <Plus theme='outline' size='14' fill='currentColor' />
          {t('conversation.welcome.newConversation')}
        </span>
      </Menu.Item>
      {onImportTasks && (
        <Menu.Item key='import-tasks' data-testid='sider-new-menu-import-tasks'>
          <span className='inline-flex items-center gap-8px'>
            <Github theme='outline' size='14' fill='currentColor' />
            {t('common.newMenu.importTasks')}
          </span>
        </Menu.Item>
      )}
      <Menu.Item key='batch-manage' data-testid='sider-new-menu-batch-manage'>
        <span className='inline-flex items-center gap-8px'>
          <ListCheckbox theme='outline' size='14' fill='currentColor' />
          {t('conversation.history.batchManage')}
        </span>
      </Menu.Item>
    </Menu>
  );

  if (collapsed) {
    return (
      <div className='shrink-0 flex flex-col items-center gap-2px w-full'>
        <Tooltip {...siderTooltipProps} content={t('conversation.welcome.newConversation')} position='right'>
          <div
            className={classNames(
              'w-full h-34px flex items-center justify-center cursor-pointer transition-colors text-t-primary rd-8px hover:bg-fill-3 active:bg-fill-4',
              styles.newChatTrigger
            )}
            onClick={onNewChat}
          >
            <Plus
              theme='outline'
              size='16'
              fill='currentColor'
              className={classNames('block leading-none', styles.newChatIcon)}
              style={{ lineHeight: 0 }}
            />
          </div>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className='shrink-0 flex items-center gap-8px'>
      <Tooltip {...siderTooltipProps} content={t('conversation.welcome.newConversation')} position='right'>
        <div
          className={classNames(
            styles.newChatTrigger,
            'h-34px flex-1 flex items-center justify-start gap-8px ps-10px pe-8px rd-0.5rem cursor-pointer group transition-all bg-transparent text-t-primary hover:bg-fill-3 active:bg-fill-4',
            isMobile && 'sider-action-btn-mobile'
          )}
          onClick={onNewChat}
        >
          <span className='size-22px rd-6px bg-aou-2 border border-solid border-[var(--color-border-2)] group-hover:bg-fill-3 group-hover:border-transparent flex items-center justify-center shrink-0 transition-colors'>
            <Plus
              theme='outline'
              size='14'
              fill='currentColor'
              className={classNames('block leading-none', styles.newChatIcon)}
              style={{ lineHeight: 0 }}
            />
          </span>
          <span className='collapsed-hidden text-t-primary text-14px font-[500] leading-24px'>
            {t('conversation.welcome.newConversation')}
          </span>
        </div>
      </Tooltip>
      {isBatchMode ? (
        <Tooltip {...siderTooltipProps} content={t('conversation.history.batchModeExit')} position='right'>
          <div
            data-testid='sider-batch-mode-exit'
            className={classNames(
              'size-26px rd-6px flex items-center justify-center cursor-pointer shrink-0 transition-colors border border-solid bg-[rgba(var(--primary-6),0.12)] border-[rgba(var(--primary-6),0.24)] !text-primary',
              isMobile && 'sider-action-icon-btn-mobile'
            )}
            onClick={onToggleBatchMode}
          >
            <ListCheckbox theme='outline' size='14' className='block leading-none shrink-0' style={{ lineHeight: 0 }} />
          </div>
        </Tooltip>
      ) : (
        <Dropdown droplist={newMenu} trigger='click' position='bl'>
          <Button
            type='text'
            size='mini'
            data-testid='sider-new-menu-trigger'
            aria-label={t('common.newMenu.more')}
            className={classNames(
              '!size-26px !p-0 !min-w-0 shrink-0 !text-t-secondary hover:!text-t-primary hover:!bg-fill-3',
              isMobile && 'sider-action-icon-btn-mobile'
            )}
            icon={<Down theme='outline' size='14' fill='currentColor' />}
          />
        </Dropdown>
      )}
    </div>
  );
};

export default SiderToolbar;
