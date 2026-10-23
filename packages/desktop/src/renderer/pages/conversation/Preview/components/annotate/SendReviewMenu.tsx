/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ReviewBatch } from '@/common/types/agent/taskSession';
import { useConversationHistoryContextSafe } from '@/renderer/hooks/context/ConversationHistoryContext';
import { Input, Message, Modal, Radio, Select, Spin } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR, { useSWRConfig } from 'swr';
import type { ReviewScope } from './useReviewThreads';
import { batchThreads, canSteer, defaultTargetId, requestedDelivery, routeConversationId } from './sendModel';

type Props = {
  visible: boolean;
  scope: ReviewScope;
  onClose: () => void;
  onSent?: (batch: ReviewBatch) => void;
};

const MAX_TARGETS = 50;

/**
 * "Send to agent" (M7 E4 §2.2): every unresolved annotation of the scope goes
 * to one conversation as one review block. Core assembles the block, so the
 * preview lists the notes and lets the user rewrite the opening preface.
 */
const SendReviewMenu: React.FC<Props> = ({ visible, scope, onClose, onSent }) => {
  const { t } = useTranslation();
  const { mutate: mutateGlobal } = useSWRConfig();
  const history = useConversationHistoryContextSafe();
  const fallbackTarget = defaultTargetId(scope, routeConversationId(window.location.hash));
  const [target, setTarget] = useState<string | undefined>(fallbackTarget);
  const [steer, setSteer] = useState(false);
  const [preface, setPreface] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTarget(fallbackTarget);
    setSteer(false);
    setPreface('');
  }, [visible, fallbackTarget]);

  const { data: scopeThreads, isLoading } = useSWR(
    visible ? ['reviewScopeThreads', scope.scope_kind, scope.scope_id] : null,
    () => ipcBridge.review.list.invoke({ scope_kind: scope.scope_kind, scope_id: scope.scope_id })
  );
  const notes = useMemo(() => batchThreads(scopeThreads ?? []), [scopeThreads]);

  const { data: capabilities } = useSWR(visible && target ? ['conversationCapabilities', target] : null, () =>
    ipcBridge.conversation.getCapabilities.invoke({ conversation_id: target! })
  );
  const running = target ? (history?.isConversationGenerating(target) ?? false) : false;
  const steerable = canSteer(capabilities, running);
  useEffect(() => {
    if (!steerable) setSteer(false);
  }, [steerable]);

  const options = useMemo(() => {
    const list = (history?.conversations ?? []).slice(0, MAX_TARGETS).map((item) => ({
      value: item.id,
      label: item.name || item.id,
    }));
    if (target && !list.some((item) => item.value === target)) list.unshift({ value: target, label: target });
    return list;
  }, [history?.conversations, target]);

  const send = async () => {
    if (!target || notes.length === 0) return;
    setSending(true);
    try {
      const result = await ipcBridge.review.sendBatch.invoke({
        target_conversation_id: target,
        delivery: requestedDelivery(steer),
        thread_ids: notes.map((thread) => thread.id),
        scope_kind: scope.scope_kind,
        scope_id: scope.scope_id,
        preface: preface.trim() ? preface : undefined,
      });
      Message.success(t('preview.annotate.send.sent', { count: notes.length }));
      // Every file of the scope moved open → sent.
      await mutateGlobal(
        (key) =>
          Array.isArray(key) &&
          (key[0] === 'reviewThreads' || key[0] === 'reviewScopeThreads') &&
          key[1] === scope.scope_kind &&
          key[2] === scope.scope_id
      );
      onSent?.(result.batch);
      onClose();
    } catch (error) {
      Message.error(
        t('preview.annotate.send.failed', { message: error instanceof Error ? error.message : String(error) })
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      title={t('preview.annotate.send.title')}
      onCancel={onClose}
      onOk={() => void send()}
      okText={t('preview.annotate.send.confirm', { count: notes.length })}
      okButtonProps={{ disabled: !target || notes.length === 0, loading: sending }}
      unmountOnExit
    >
      <div className='flex flex-col gap-12px' data-testid='review-send-menu'>
        <div className='flex flex-col gap-4px'>
          <span className='text-12px text-t-secondary'>{t('preview.annotate.send.target')}</span>
          <Select
            value={target}
            options={options}
            onChange={(value: string) => setTarget(value)}
            placeholder={t('preview.annotate.send.targetPlaceholder')}
            showSearch
            data-testid='review-send-target'
          />
        </div>
        <div className='flex flex-col gap-4px'>
          <span className='text-12px text-t-secondary'>{t('preview.annotate.send.mode')}</span>
          <Radio.Group
            value={steer ? 'steer' : 'followup'}
            onChange={(value: string) => setSteer(value === 'steer')}
            direction='vertical'
          >
            <Radio value='followup'>{t('preview.annotate.send.followup')}</Radio>
            <Radio value='steer' disabled={!steerable} data-testid='review-send-steer'>
              {t('preview.annotate.send.steer')}
            </Radio>
          </Radio.Group>
          {!steerable ? (
            <span className='text-12px text-t-tertiary'>{t('preview.annotate.send.steerUnavailable')}</span>
          ) : null}
        </div>
        <div className='flex flex-col gap-4px'>
          <span className='text-12px text-t-secondary'>{t('preview.annotate.send.preface')}</span>
          <Input.TextArea
            value={preface}
            onChange={setPreface}
            placeholder={t('preview.annotate.send.prefacePlaceholder')}
            autoSize={{ minRows: 2, maxRows: 6 }}
          />
        </div>
        <div className='flex flex-col gap-4px'>
          <span className='text-12px text-t-secondary'>
            {t('preview.annotate.send.preview', { count: notes.length })}
          </span>
          {isLoading ? (
            <Spin size={16} />
          ) : notes.length === 0 ? (
            <span className='text-12px text-t-tertiary'>{t('preview.annotate.send.empty')}</span>
          ) : (
            <ol className='m-0 pl-18px max-h-240px overflow-y-auto flex flex-col gap-4px text-12px'>
              {notes.map((thread) => (
                <li key={thread.id} className='min-w-0' data-testid='review-send-note'>
                  <div className='text-t-secondary [overflow-wrap:anywhere]'>
                    {thread.start_line === thread.end_line
                      ? `${thread.file_path}  L${thread.start_line}`
                      : `${thread.file_path}  L${thread.start_line}–L${thread.end_line}`}
                  </div>
                  <div className='text-t-primary whitespace-pre-wrap [overflow-wrap:anywhere]'>
                    {thread.comments[0]?.body ?? ''}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SendReviewMenu;
