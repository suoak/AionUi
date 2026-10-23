/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { WorktreeBranchPolicy, WorktreeDiffStat, WorktreeInfo } from '@/common/types/worktree';
import { emitter } from '@/renderer/utils/emitter';
import { Button, Checkbox, Message, Modal, Radio, Spin } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PreservedBranchesDialog from './PreservedBranchesDialog';
import { defaultBranchPolicy, worktreeErrorKey } from './worktreeModel';

type WorktreeRemoveDialogProps = {
  visible: boolean;
  worktreeId: string;
  /** The conversation bound to the worktree; deleted first (Core refuses to remove a bound worktree). */
  conversationId?: string;
  onClose: () => void;
};

const isCurrentConversation = (conversationId: string) =>
  window.location.hash.startsWith(`#/conversation/${conversationId}`);

/**
 * "Delete conversation and worktree" (design E3 §2.1 step 5). Order matters:
 * deleting the conversation unbinds the worktree, then the worktree is removed
 * with the chosen branch policy. A dirty worktree stays (unbound) unless the
 * user discards its changes.
 */
const WorktreeRemoveDialog: React.FC<WorktreeRemoveDialogProps> = ({
  visible,
  worktreeId,
  conversationId,
  onClose,
}) => {
  const { t } = useTranslation();
  const [info, setInfo] = useState<WorktreeInfo | null>(null);
  const [diffStat, setDiffStat] = useState<WorktreeDiffStat | null>(null);
  const [loading, setLoading] = useState(false);
  const [policy, setPolicy] = useState<WorktreeBranchPolicy>('auto');
  const [forceDir, setForceDir] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conversationRemoved, setConversationRemoved] = useState(false);
  const [dirtyBlocked, setDirtyBlocked] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setForceDir(false);
    setDirtyBlocked(false);
    setConversationRemoved(false);
    void Promise.allSettled([
      ipcBridge.worktree.get.invoke({ id: worktreeId }),
      ipcBridge.worktree.diffStat.invoke({ id: worktreeId }),
    ]).then(([detail, stat]) => {
      if (cancelled) return;
      const nextInfo = detail.status === 'fulfilled' ? detail.value : null;
      setInfo(nextInfo);
      setDiffStat(stat.status === 'fulfilled' ? stat.value : null);
      setPolicy(defaultBranchPolicy(nextInfo));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, worktreeId]);

  const hasChanges = (diffStat?.files_changed ?? 0) > 0;

  const handleConfirm = useCallback(async () => {
    setBusy(true);
    try {
      if (conversationId && !conversationRemoved) {
        const removed = await ipcBridge.conversation.remove.invoke({ id: conversationId });
        if (!removed) {
          Message.error(t('conversation.history.deleteFailed'));
          return;
        }
        setConversationRemoved(true);
        emitter.emit('conversation.deleted', conversationId);
        emitter.emit('chat.history.refresh');
        if (isCurrentConversation(conversationId)) window.location.hash = '#/';
      }
      if (!info) {
        // The record is gone (pruned or removed elsewhere): nothing left to do.
        onClose();
        return;
      }
      await ipcBridge.worktree.remove.invoke({ id: worktreeId, branch: policy, force_dir: forceDir });
      Message.success(
        policy === 'force' ? t('conversation.worktree.removedWithBranch') : t('conversation.worktree.removed')
      );
      onClose();
    } catch (error) {
      if (isBackendHttpError(error) && error.code === 'WORKTREE_DIRTY') {
        setDirtyBlocked(true);
        setForceDir(false);
        return;
      }
      const code = isBackendHttpError(error) ? error.code : undefined;
      Message.error(t(worktreeErrorKey(code)));
    } finally {
      setBusy(false);
    }
  }, [conversationId, conversationRemoved, forceDir, info, onClose, policy, t, worktreeId]);

  return (
    <>
      <Modal
        visible={visible}
        title={t('conversation.worktree.removeTitle')}
        onCancel={onClose}
        maskClosable={!busy}
        footer={
          <div className='flex items-center gap-8px'>
            <Button type='text' size='small' onClick={() => setReviewOpen(true)}>
              {t('conversation.worktree.reviewPreserved')}
            </Button>
            <span className='flex-1' />
            <Button onClick={onClose} disabled={busy}>
              {conversationRemoved ? t('conversation.worktree.keepForNow') : t('common.cancel')}
            </Button>
            <Button
              type='primary'
              status='danger'
              loading={busy}
              disabled={loading || (dirtyBlocked && !forceDir)}
              onClick={() => void handleConfirm()}
              data-testid='worktree-remove-confirm'
            >
              {t('conversation.worktree.removeConfirm')}
            </Button>
          </div>
        }
        unmountOnExit
      >
        {loading ? (
          <div className='flex justify-center py-16px'>
            <Spin />
          </div>
        ) : (
          <div className='flex flex-col gap-12px text-13px text-t-primary'>
            <span className='text-t-secondary'>
              {conversationId && !conversationRemoved
                ? t('conversation.worktree.removeDescription')
                : t('conversation.worktree.removeDetachedDescription')}
            </span>
            {info && (
              <div className='flex flex-col gap-4px rd-6px bg-fill-1 px-10px py-8px text-12px'>
                <span className='break-all'>
                  {t('conversation.worktree.branchLabel')}: <code>{info.branch}</code>
                </span>
                <span className='break-all text-t-secondary'>{info.path}</span>
                {(info.ahead ?? 0) > 0 && (
                  <span className='text-warning-6'>
                    {t('conversation.worktree.unmergedCommits', { count: info.ahead ?? 0 })}
                  </span>
                )}
                {hasChanges && (
                  <span className='text-warning-6'>
                    {t('conversation.worktree.uncommittedSummary', {
                      files: diffStat?.files_changed ?? 0,
                      additions: diffStat?.additions ?? 0,
                      deletions: diffStat?.deletions ?? 0,
                    })}
                  </span>
                )}
              </div>
            )}
            <div className='flex flex-col gap-6px'>
              <span className='text-12px text-t-secondary'>{t('conversation.worktree.branchPolicy')}</span>
              <Radio.Group
                direction='vertical'
                value={policy}
                onChange={(value: WorktreeBranchPolicy) => setPolicy(value)}
              >
                <Radio value='auto'>{t('conversation.worktree.policyAuto')}</Radio>
                <Radio value='keep'>{t('conversation.worktree.policyKeep')}</Radio>
                <Radio value='force'>
                  <span className='text-danger-6'>{t('conversation.worktree.policyForce')}</span>
                </Radio>
              </Radio.Group>
            </div>
            {(hasChanges || dirtyBlocked) && (
              <Checkbox checked={forceDir} onChange={(checked: boolean) => setForceDir(checked)}>
                <span className='text-danger-6'>{t('conversation.worktree.discardChanges')}</span>
              </Checkbox>
            )}
            {dirtyBlocked && (
              <span className='text-12px text-warning-6' role='alert'>
                {t('conversation.worktree.dirtyBlocked')}
              </span>
            )}
          </div>
        )}
      </Modal>
      <PreservedBranchesDialog
        visible={reviewOpen}
        repoPath={info?.source_repo_path}
        onClose={() => setReviewOpen(false)}
      />
    </>
  );
};

export default WorktreeRemoveDialog;
