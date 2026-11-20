/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { StartTaskResult, TaskBoardItem } from '@/common/types/agent/taskSession';
import type { FanoutGroup } from '@/common/types/fanout';
import AdoptDialog from '@/renderer/pages/conversation/fanout/AdoptDialog';
import FanoutCompareView from '@/renderer/pages/conversation/fanout/FanoutCompareView';
import { Alert, Button, Checkbox, Input, Message, Modal, Spin } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TaskBoardReviewPanel from './TaskBoardReviewPanel';
import { adoptSlotFor, parseDelivery, reviewActions, reviewGroupFor } from './taskDetailModel';

type Props = {
  item: TaskBoardItem;
  interactive: boolean;
  refreshKey?: number;
  onItemUpdated?: (item: TaskBoardItem) => void;
  /** Something changed that the board should reload (adopt, follow-up). */
  onChanged?: () => void;
};

const errorText = (error: unknown): string => {
  if (isBackendHttpError(error)) return error.backendMessage || error.message;
  return error instanceof Error ? error.message : String(error);
};

/**
 * 3.0 U3 review tab: the task's changes (single-slot diff), then
 * Adopt ▾ (squash by default, D4) | Open PR | Request changes.
 */
const TaskReviewTab: React.FC<Props> = ({ item, interactive, refreshKey = 0, onItemUpdated, onChanged }) => {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<FanoutGroup[] | null>(null);
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [prOpen, setPrOpen] = useState(false);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prDraft, setPrDraft] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesText, setChangesText] = useState('');
  const [busy, setBusy] = useState<'pr' | 'changes' | null>(null);

  const loadGroups = useCallback(() => {
    let cancelled = false;
    const listGroups = ipcBridge.fanout?.list;
    if (!listGroups) {
      setGroups([]);
      return undefined;
    }
    listGroups
      .invoke({ task_session_id: item.id })
      .then((list) => {
        if (!cancelled) setGroups(Array.isArray(list) ? list : []);
      })
      .catch((error) => {
        console.error('[TaskReview] Failed to load the task changes:', error);
        if (!cancelled) setGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  useEffect(() => loadGroups(), [loadGroups, refreshKey, item.updated_at]);

  const group = groups ? reviewGroupFor(groups) : null;
  const delivery = parseDelivery(item);
  const actions = reviewActions(item, group);
  const slot = adoptSlotFor(group);

  const openPr = async (kind: 'pr' | 'update_pr') => {
    setBusy('pr');
    try {
      const updated = await ipcBridge.taskSession.board.deliver.invoke({
        id: item.id,
        kind,
        ...(kind === 'pr'
          ? { title: prTitle.trim() || item.title, body: prBody.trim() || undefined, draft: prDraft }
          : {}),
      });
      onItemUpdated?.(updated);
      setPrOpen(false);
      Message.success(
        kind === 'pr' ? t('conversation.taskBoard.review3.prOpened') : t('conversation.taskBoard.review3.prUpdated')
      );
    } catch (error) {
      Message.error(t('conversation.taskBoard.review3.prFailed', { reason: errorText(error) }));
    } finally {
      setBusy(null);
    }
  };

  const requestChanges = async () => {
    const text = changesText.trim();
    if (!text) return;
    setBusy('changes');
    try {
      const result: StartTaskResult = await ipcBridge.taskSession.board.followUp.invoke({ id: item.id, text });
      onItemUpdated?.(result.item);
      setChangesOpen(false);
      setChangesText('');
      Message.success(
        result.state === 'queued' || result.state === 'already_queued'
          ? t('conversation.taskBoard.flow.queued')
          : t('conversation.taskBoard.review3.changesSent')
      );
      onChanged?.();
    } catch (error) {
      Message.error(t('conversation.taskBoard.review3.changesFailed', { reason: errorText(error) }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className='flex flex-col gap-16px' data-testid='task-review-tab'>
      {delivery.adopt?.status === 'conflict' ? (
        <Alert
          type='warning'
          data-testid='task-review-conflict'
          title={t('conversation.taskBoard.review3.conflictTitle')}
          content={delivery.adopt.message || t('conversation.taskBoard.review3.conflictBody')}
        />
      ) : null}
      {delivery.adopt?.status === 'adopted' ? (
        <Alert
          type='success'
          data-testid='task-review-adopted'
          content={t('conversation.taskBoard.review3.adopted', {
            branch: delivery.adopt.target_branch || delivery.adopt.branch || '',
            commit: (delivery.adopt.result_commit ?? '').slice(0, 8),
          })}
        />
      ) : null}
      {delivery.pull_request ? (
        <div className='text-13px text-t-secondary' data-testid='task-review-pr'>
          {t('conversation.taskBoard.review3.prLink')}{' '}
          <a href={delivery.pull_request.url} target='_blank' rel='noreferrer' className='text-[rgb(var(--primary-6))]'>
            {delivery.pull_request.number ? `#${delivery.pull_request.number}` : delivery.pull_request.url}
          </a>
        </div>
      ) : null}

      {interactive && (actions.adopt || actions.openPr || actions.updatePr || actions.requestChanges) ? (
        <div className='flex flex-wrap items-center gap-8px' data-testid='task-review-actions'>
          {actions.adopt ? (
            <Button type='primary' data-testid='task-review-adopt' onClick={() => setAdoptOpen(true)}>
              {t('conversation.taskBoard.review3.adopt')}
            </Button>
          ) : null}
          {actions.openPr ? (
            <Button
              data-testid='task-review-open-pr'
              onClick={() => {
                setPrTitle(item.title);
                setPrBody('');
                setPrDraft(false);
                setPrOpen(true);
              }}
            >
              {t('conversation.taskBoard.review3.openPr')}
            </Button>
          ) : null}
          {actions.updatePr ? (
            <Button
              data-testid='task-review-update-pr'
              loading={busy === 'pr'}
              onClick={() => void openPr('update_pr')}
            >
              {t('conversation.taskBoard.review3.updatePr')}
            </Button>
          ) : null}
          {actions.requestChanges ? (
            <Button status='warning' data-testid='task-review-request-changes' onClick={() => setChangesOpen(true)}>
              {t('conversation.taskBoard.review3.requestChanges')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {interactive && item.board_status === 'in_review' ? (
        <TaskBoardReviewPanel item={item} onReviewed={(next) => onItemUpdated?.(next)} />
      ) : null}

      {groups === null ? (
        <Spin />
      ) : group ? (
        <FanoutCompareView group={group} assistantName={(id) => id} />
      ) : (
        <div className='text-13px text-t-secondary' data-testid='task-review-empty'>
          {t('conversation.taskBoard.review3.noChanges')}
        </div>
      )}

      {group && slot ? (
        <AdoptDialog
          visible={adoptOpen}
          group={group}
          slot={slot}
          defaultStrategy='squash'
          onClose={() => setAdoptOpen(false)}
          onAdopted={(next) => {
            setAdoptOpen(false);
            setGroups((prev) => (prev ?? []).map((g) => (g.id === next.id ? next : g)));
            onChanged?.();
          }}
        />
      ) : null}

      <Modal
        visible={prOpen}
        title={t('conversation.taskBoard.review3.openPrTitle')}
        onCancel={() => setPrOpen(false)}
        onOk={() => void openPr('pr')}
        okText={t('conversation.taskBoard.review3.openPr')}
        cancelText={t('common.cancel')}
        confirmLoading={busy === 'pr'}
        unmountOnExit
      >
        <div className='flex flex-col gap-12px' data-testid='task-review-pr-form'>
          <Input value={prTitle} onChange={setPrTitle} data-testid='task-review-pr-title' />
          <Input.TextArea
            value={prBody}
            onChange={setPrBody}
            autoSize={{ minRows: 3, maxRows: 10 }}
            placeholder={t('conversation.taskBoard.review3.prBodyPlaceholder')}
            data-testid='task-review-pr-body'
          />
          <Checkbox checked={prDraft} onChange={setPrDraft} data-testid='task-review-pr-draft'>
            {t('conversation.taskBoard.review3.prDraft')}
          </Checkbox>
          <div className='text-12px text-t-tertiary'>{t('conversation.taskBoard.review3.prHint')}</div>
        </div>
      </Modal>

      <Modal
        visible={changesOpen}
        title={t('conversation.taskBoard.review3.requestChanges')}
        onCancel={() => setChangesOpen(false)}
        onOk={() => void requestChanges()}
        okText={t('conversation.taskBoard.review3.sendChanges')}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: !changesText.trim() }}
        confirmLoading={busy === 'changes'}
        unmountOnExit
      >
        <Input.TextArea
          autoFocus
          value={changesText}
          onChange={setChangesText}
          autoSize={{ minRows: 3, maxRows: 10 }}
          placeholder={t('conversation.taskBoard.review3.changesPlaceholder')}
          data-testid='task-review-changes-text'
        />
      </Modal>
    </div>
  );
};

export default TaskReviewTab;
