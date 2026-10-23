/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { WorktreeInfo } from '@/common/types/worktree';
import { Button, Empty, Message, Modal, Spin, Tag } from '@arco-design/web-react';
import { Copy, FolderOpen } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { detachedWorktrees, preservedBranches, repoDisplayName, worktreeErrorKey } from './worktreeModel';

type PreservedBranchesDialogProps = {
  visible: boolean;
  /** Limit to one source repository; omit for all. */
  repoPath?: string;
  onClose: () => void;
};

/**
 * Review what worktree cleanup left behind (design E3 §2.1 step 5): branches
 * Core kept because they had unmerged commits, and worktrees still on disk
 * that no conversation holds. Nothing here is removed without a click.
 */
const PreservedBranchesDialog: React.FC<PreservedBranchesDialogProps> = ({ visible, repoPath, onClose }) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await ipcBridge.worktree.list.invoke({ repo_path: repoPath, include_removed: true }));
    } catch (error) {
      console.warn('[worktree] list failed:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    if (visible) void reload();
  }, [visible, reload]);

  const preserved = preservedBranches(rows);
  const detached = detachedWorktrees(rows);

  const copyBranch = useCallback(
    async (branch: string) => {
      try {
        await navigator.clipboard.writeText(branch);
        Message.success(t('conversation.worktree.branchCopied'));
      } catch {
        Message.error(t('conversation.worktree.copyFailed'));
      }
    },
    [t]
  );

  const openFolder = useCallback((path: string) => {
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: path, tool: 'explorer' }).catch((error: unknown) => {
      console.warn('[worktree] open folder failed:', error);
    });
  }, []);

  const removeDetached = useCallback(
    async (row: WorktreeInfo) => {
      setBusyId(row.id);
      try {
        await ipcBridge.worktree.remove.invoke({ id: row.id, branch: 'auto' });
        Message.success(t('conversation.worktree.removed'));
        await reload();
      } catch (error) {
        Message.error(t(worktreeErrorKey(isBackendHttpError(error) ? error.code : undefined)));
      } finally {
        setBusyId(null);
      }
    },
    [reload, t]
  );

  const prune = useCallback(async () => {
    setBusyId('prune');
    try {
      const result = await ipcBridge.worktree.prune.invoke();
      Message.success(t('conversation.worktree.pruned', { count: result.pruned.length }));
      await reload();
    } catch (error) {
      Message.error(t(worktreeErrorKey(isBackendHttpError(error) ? error.code : undefined)));
    } finally {
      setBusyId(null);
    }
  }, [reload, t]);

  const renderRow = (row: WorktreeInfo, detachedRow: boolean) => (
    <div
      key={row.id}
      className='flex items-center gap-8px rd-6px px-8px py-6px hover:bg-fill-2'
      data-testid={`worktree-review-row-${row.id}`}
    >
      <div className='flex min-w-0 flex-1 flex-col'>
        <span className='truncate text-13px text-t-primary'>{row.branch}</span>
        <span className='truncate text-11px text-t-tertiary'>
          {repoDisplayName(row.source_repo_path)}
          {detachedRow ? ` · ${row.path}` : ''}
        </span>
      </div>
      {detachedRow && (
        <Tag size='small' color={row.status === 'failed' ? 'red' : 'orange'}>
          {t(`conversation.worktree.status.${row.status}`)}
        </Tag>
      )}
      <Button
        size='mini'
        type='text'
        aria-label={t('conversation.worktree.copyBranch')}
        icon={<Copy theme='outline' size='14' />}
        onClick={() => void copyBranch(row.branch)}
      />
      {detachedRow && (
        <>
          <Button
            size='mini'
            type='text'
            aria-label={t('conversation.worktree.openFolder')}
            icon={<FolderOpen theme='outline' size='14' />}
            onClick={() => openFolder(row.path)}
          />
          <Button size='mini' status='danger' loading={busyId === row.id} onClick={() => void removeDetached(row)}>
            {t('conversation.worktree.remove')}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <Modal
      visible={visible}
      title={t('conversation.worktree.reviewTitle')}
      onCancel={onClose}
      footer={
        <div className='flex items-center gap-8px'>
          <Button size='small' loading={busyId === 'prune'} onClick={() => void prune()}>
            {t('conversation.worktree.prune')}
          </Button>
          <span className='flex-1' />
          <Button onClick={onClose}>{t('common.close')}</Button>
        </div>
      }
      unmountOnExit
    >
      {loading ? (
        <div className='flex justify-center py-16px'>
          <Spin />
        </div>
      ) : preserved.length === 0 && detached.length === 0 ? (
        <Empty description={t('conversation.worktree.reviewEmpty')} />
      ) : (
        <div className='flex max-h-420px flex-col gap-12px overflow-y-auto'>
          {detached.length > 0 && (
            <section className='flex flex-col gap-4px'>
              <span className='text-12px text-t-secondary'>{t('conversation.worktree.detachedSection')}</span>
              {detached.map((row) => renderRow(row, true))}
            </section>
          )}
          {preserved.length > 0 && (
            <section className='flex flex-col gap-4px'>
              <span className='text-12px text-t-secondary'>{t('conversation.worktree.preservedSection')}</span>
              <span className='text-11px text-t-tertiary'>{t('conversation.worktree.preservedHint')}</span>
              {preserved.map((row) => renderRow(row, false))}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
};

export default PreservedBranchesDialog;
