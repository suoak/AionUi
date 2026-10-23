/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { FanoutGroup, FanoutSlot } from '@/common/types/fanout';
import { Button, Empty, Message, Modal, Spin, Tag } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import AdoptDialog from './AdoptDialog';
import FanoutCompareView from './FanoutCompareView';
import PreservedBranchesDialog from './PreservedBranchesDialog';
import {
  canAdoptSlot,
  canDiscardGroup,
  fanoutErrorKey,
  isFanoutLive,
  isFanoutTerminal,
  shortCommit,
} from './fanoutModel';
import { repoDisplayName } from './worktreeModel';

const STATUS_COLOR: Record<string, string> = {
  preparing: 'arcoblue',
  starting: 'arcoblue',
  running: 'arcoblue',
  comparing: 'orange',
  finished: 'green',
  adopted: 'green',
  failed: 'red',
  cancelled: 'gray',
  discarded: 'gray',
  removed: 'gray',
};

const fetchGroup = async ([, id]: [string, string]): Promise<FanoutGroup | null> => {
  try {
    return await ipcBridge.fanout.get.invoke({ id });
  } catch (error) {
    if (isBackendHttpError(error) && error.status === 404) return null;
    throw error;
  }
};

/**
 * One fan-out group (design E3 §2.3): slot progress, the compare view, and
 * the adopt / discard / cancel actions. Each slot is an ordinary conversation
 * in its own worktree, opened from its card.
 */
const FanoutGroupPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const [adoptSlot, setAdoptSlot] = useState<string | null>(null);
  const [preservedOpen, setPreservedOpen] = useState(false);
  const [busy, setBusy] = useState<'cancel' | 'discard' | null>(null);

  const {
    data: group,
    isLoading,
    mutate,
  } = useSWR(id ? ['fanout.group', id] : null, fetchGroup, {
    refreshInterval: (latest) => (isFanoutLive(latest) ? 3000 : 0),
  });
  const { data: assistants = [] } = useSWR<Assistant[]>('assistants.list', () => ipcBridge.assistants.list.invoke());

  useEffect(
    () =>
      ipcBridge.fanout.changed.on((event) => {
        if (event.group_id === id) void mutate();
      }),
    [id, mutate]
  );

  const assistantName = useCallback(
    (assistantId: string) => assistants.find((item) => item.id === assistantId)?.name ?? assistantId,
    [assistants]
  );

  const runAction = useCallback(
    async (kind: 'cancel' | 'discard') => {
      if (!group) return;
      setBusy(kind);
      try {
        const next = await ipcBridge.fanout[kind].invoke({ id: group.id });
        await mutate(next, { revalidate: false });
      } catch (error) {
        console.warn(`[fanout] ${kind} failed:`, error);
        Message.error(t(fanoutErrorKey(isBackendHttpError(error) ? error.code : undefined)));
      } finally {
        setBusy(null);
      }
    },
    [group, mutate, t]
  );

  const confirmDiscard = useCallback(() => {
    Modal.confirm({
      title: t('conversation.fanout.discardTitle'),
      content: t('conversation.fanout.discardBody'),
      okButtonProps: { status: 'danger' },
      onOk: () => runAction('discard'),
    });
  }, [runAction, t]);

  const live = isFanoutLive(group);
  const showCompare = useMemo(
    () => Boolean(group && group.status !== 'preparing' && group.status !== 'cancelled'),
    [group]
  );

  if (isLoading && !group) return <Spin className='m-24px' />;
  if (!group) return <Empty className='mt-48px' description={t('conversation.fanout.notFound')} />;

  const result = group.adopt_result;

  return (
    <div className='flex size-full flex-col gap-16px overflow-auto p-20px' data-testid='fanout-group-page'>
      <div className='flex flex-wrap items-center gap-8px'>
        <span className='text-16px font-medium text-t-primary'>{group.title || t('conversation.fanout.title')}</span>
        <Tag color={STATUS_COLOR[group.status]}>{t(`conversation.fanout.groupStatus.${group.status}`)}</Tag>
        <span className='text-12px text-t-secondary'>
          {repoDisplayName(group.source_repo_path)} · {group.base_ref} @ {shortCommit(group.base_commit)}
        </span>
        <div className='ms-auto flex gap-8px'>
          {live && (
            <Button size='small' loading={busy === 'cancel'} onClick={() => void runAction('cancel')}>
              {t('conversation.fanout.cancel')}
            </Button>
          )}
          {canDiscardGroup(group) && (
            <Button size='small' status='danger' loading={busy === 'discard'} onClick={confirmDiscard}>
              {t('conversation.fanout.discard')}
            </Button>
          )}
          {isFanoutTerminal(group.status) && (
            <Button size='small' onClick={() => setPreservedOpen(true)}>
              {t('conversation.worktree.reviewPreserved')}
            </Button>
          )}
        </div>
      </div>

      <div className='whitespace-pre-wrap rd-8px bg-fill-2 p-10px text-12px text-t-secondary'>{group.prompt}</div>

      <div className='grid gap-8px' style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {group.slots.map((slot: FanoutSlot) => (
          <div
            key={slot.slot}
            className='flex flex-col gap-6px rd-8px b-1 b-solid b-[var(--color-border-2)] p-10px'
            data-testid='fanout-slot-card'
          >
            <div className='flex items-center gap-6px'>
              <span className='text-14px font-medium text-t-primary'>{slot.slot}</span>
              <span className='flex-1 truncate text-12px text-t-secondary'>{assistantName(slot.assistant_id)}</span>
              <Tag size='small' color={STATUS_COLOR[slot.status]}>
                {t(`conversation.fanout.slotStatus.${slot.status}`)}
              </Tag>
            </div>
            <span className='truncate font-mono text-11px text-t-tertiary' title={slot.branch}>
              {slot.branch}
            </span>
            {slot.error && <span className='text-11px text-danger-6'>{t(fanoutErrorKey(slot.error.code))}</span>}
            <div className='flex gap-6px'>
              {slot.conversation_id && (
                <Button
                  size='mini'
                  onClick={() => void navigate(`/conversation/${encodeURIComponent(slot.conversation_id ?? '')}`)}
                >
                  {t('conversation.fanout.openSlot')}
                </Button>
              )}
              {canAdoptSlot(group, slot) && (
                <Button size='mini' type='primary' onClick={() => setAdoptSlot(slot.slot)}>
                  {t('conversation.fanout.adopt')}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {result && (
        <div className='flex flex-col gap-4px rd-8px bg-fill-2 p-10px text-12px' data-testid='fanout-adopt-result'>
          <span className='font-medium text-t-primary'>
            {t('conversation.fanout.adoptedSummary', {
              slot: result.slot,
              branch: result.branch,
              strategy: t(`conversation.fanout.strategies.${result.strategy}`),
            })}
          </span>
          {result.result_commit && (
            <span className='text-t-secondary'>
              {t('conversation.fanout.resultCommit', {
                target: result.target_branch ?? '',
                commit: shortCommit(result.result_commit),
              })}
            </span>
          )}
          {result.preserved_branches.length > 0 && (
            <span className='text-t-secondary'>
              {t('conversation.fanout.preservedBranches', { branches: result.preserved_branches.join(', ') })}
            </span>
          )}
          {(result.cleanup_errors ?? []).length > 0 && (
            <span className='text-warning-6'>
              {t('conversation.fanout.cleanupErrors', { count: result.cleanup_errors?.length ?? 0 })}
            </span>
          )}
        </div>
      )}

      {showCompare && <FanoutCompareView group={group} assistantName={assistantName} />}

      <AdoptDialog
        visible={adoptSlot !== null}
        group={group}
        slot={adoptSlot}
        onClose={() => setAdoptSlot(null)}
        onAdopted={(next) => void mutate(next, { revalidate: true })}
      />
      <PreservedBranchesDialog
        visible={preservedOpen}
        repoPath={group.source_repo_path}
        onClose={() => setPreservedOpen(false)}
      />
    </div>
  );
};

export default FanoutGroupPage;
