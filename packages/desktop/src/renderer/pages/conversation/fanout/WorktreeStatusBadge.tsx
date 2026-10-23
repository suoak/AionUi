/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { WorktreeChangedEvent, WorktreeDiffStat, WorktreeInfo } from '@/common/types/worktree';
import { Button, Popover, Tag } from '@arco-design/web-react';
import { BranchOne, Delete, FolderOpen } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import WorktreeRemoveDialog from './WorktreeRemoveDialog';
import { conversationWorktreeId, repoDisplayName } from './worktreeModel';

type WorktreeStatusBadgeProps = {
  conversationId: string;
  /** The conversation's server-owned `extra`; the badge renders only when it carries `worktree_id`. */
  extra: unknown;
};

const statusColor = (status: WorktreeInfo['status'] | undefined): string | undefined => {
  if (status === 'failed' || status === 'orphaned') return 'red';
  if (status === 'creating' || status === 'removing') return 'arcoblue';
  return undefined;
};

/**
 * Conversation header chip for a conversation running in a managed worktree:
 * branch + status, with a popover for path, base, ahead / behind, the change
 * summary, "open folder" and delete (design E3 §4.2).
 */
const WorktreeStatusBadge: React.FC<WorktreeStatusBadgeProps> = ({ conversationId, extra }) => {
  const { t } = useTranslation();
  const worktreeId = conversationWorktreeId(extra);
  const [info, setInfo] = useState<WorktreeInfo | null>(null);
  const [diffStat, setDiffStat] = useState<WorktreeDiffStat | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!worktreeId) return;
    try {
      setInfo(await ipcBridge.worktree.get.invoke({ id: worktreeId }));
    } catch {
      setInfo(null);
    }
  }, [worktreeId]);

  useEffect(() => {
    void refresh();
    if (!worktreeId) return;
    return ipcBridge.worktree.changed.on((event: WorktreeChangedEvent) => {
      if (event.worktree_id === worktreeId) void refresh();
    });
  }, [refresh, worktreeId]);

  const loadDetails = useCallback(
    (visible: boolean) => {
      if (!visible || !worktreeId) return;
      void refresh();
      ipcBridge.worktree.diffStat
        .invoke({ id: worktreeId })
        .then(setDiffStat)
        .catch(() => setDiffStat(null));
    },
    [refresh, worktreeId]
  );

  if (!worktreeId) return null;

  const branch = info?.branch ?? t('conversation.worktree.badgeFallback');
  const content = (
    <div className='flex w-300px flex-col gap-8px text-12px' data-testid='worktree-badge-popover'>
      {info ? (
        <>
          <div className='flex flex-col gap-2px'>
            <span className='text-t-secondary'>{t('conversation.worktree.repository')}</span>
            <span className='break-all text-t-primary'>{repoDisplayName(info.source_repo_path)}</span>
          </div>
          <div className='flex flex-col gap-2px'>
            <span className='text-t-secondary'>{t('conversation.worktree.pathLabel')}</span>
            <span className='break-all text-t-primary'>{info.path}</span>
          </div>
          <div className='flex flex-wrap gap-x-12px gap-y-2px text-t-secondary'>
            <span>
              {t('conversation.worktree.baseLabel')}: <code>{info.base_ref}</code>
            </span>
            {typeof info.ahead === 'number' && (
              <span>{t('conversation.worktree.aheadBehind', { ahead: info.ahead, behind: info.behind ?? 0 })}</span>
            )}
          </div>
          {diffStat && (
            <span className='text-t-secondary'>
              {diffStat.files_changed > 0
                ? t('conversation.worktree.uncommittedSummary', {
                    files: diffStat.files_changed,
                    additions: diffStat.additions,
                    deletions: diffStat.deletions,
                  })
                : t('conversation.worktree.noChanges')}
            </span>
          )}
        </>
      ) : (
        <span className='text-t-secondary'>{t('conversation.worktree.unavailable')}</span>
      )}
      <div className='flex justify-end gap-8px'>
        {info && (
          <Button
            size='mini'
            icon={<FolderOpen theme='outline' size='12' />}
            onClick={() =>
              void ipcBridge.shell.openFolderWith
                .invoke({ folder_path: info.path, tool: 'explorer' })
                .catch((error: unknown) => console.warn('[worktree] open folder failed:', error))
            }
          >
            {t('conversation.worktree.openFolder')}
          </Button>
        )}
        <Button
          size='mini'
          status='danger'
          icon={<Delete theme='outline' size='12' />}
          onClick={() => setRemoveOpen(true)}
        >
          {t('conversation.worktree.deleteWorktree')}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Popover trigger='click' position='bottom' content={content} onVisibleChange={loadDetails}>
        <Tag
          size='small'
          color={statusColor(info?.status)}
          className='cursor-pointer max-w-220px'
          icon={<BranchOne theme='outline' size='12' fill='currentColor' />}
          data-testid='worktree-status-badge'
        >
          <span className='truncate'>
            {branch}
            {info && info.status !== 'ready' ? ` · ${t(`conversation.worktree.status.${info.status}`)}` : ''}
          </span>
        </Tag>
      </Popover>
      <WorktreeRemoveDialog
        visible={removeOpen}
        worktreeId={worktreeId}
        conversationId={conversationId}
        onClose={() => setRemoveOpen(false)}
      />
    </>
  );
};

export default WorktreeStatusBadge;
