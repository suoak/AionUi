/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IAgentApprovalRecord } from '@/common/adapter/ipcBridge';
import { Button, Message, Modal, Tag } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyApprovalEvent, pruneApprovalQueue } from './agentApprovalQueue';

const REFRESH_INTERVAL_MS = 30_000;

/**
 * Global confirmation card for configuration changes an agent asked to make
 * (MCP servers, providers, settings, agents, assistants, skills, scheduled
 * tasks). aioncore parks each request until the user approves or denies it
 * here; the agent's CLI then replays exactly the approved request once.
 */
const AgentActionApprovalHost: React.FC = () => {
  const { t } = useTranslation();
  const [queue, setQueue] = useState<IAgentApprovalRecord[]>([]);
  const [submitting, setSubmitting] = useState<'approve' | 'deny' | null>(null);

  const refresh = useCallback(async () => {
    try {
      const pending = await ipcBridge.agentApproval.listPending.invoke();
      setQueue(pruneApprovalQueue(Array.isArray(pending) ? pending : []));
    } catch {
      // Not signed in yet, or an older backend without approvals: nothing to show.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const off = ipcBridge.agentApproval.onChanged.on((record) => {
      if (record && typeof record.id === 'string') {
        setQueue((current) => applyApprovalEvent(current, record));
      }
    });
    const timer = window.setInterval(() => {
      setQueue((current) => pruneApprovalQueue(current));
      void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, [refresh]);

  const current = queue[0];

  const decide = useCallback(
    async (decision: 'approve' | 'deny') => {
      if (!current) return;
      setSubmitting(decision);
      try {
        const updated = await ipcBridge.agentApproval[decision].invoke({ id: current.id });
        setQueue((items) =>
          updated && typeof updated.id === 'string'
            ? applyApprovalEvent(items, updated)
            : items.filter((item) => item.id !== current.id)
        );
      } catch {
        Message.error(t('tools.agentApproval.submitFailed'));
        setQueue((items) => items.filter((item) => item.id !== current.id));
        void refresh();
      } finally {
        setSubmitting(null);
      }
    },
    [current, refresh, t]
  );

  if (!current) return null;

  const expiresAt = new Date(current.expires_at).toLocaleTimeString();

  return (
    <Modal
      visible
      title={t('tools.agentApproval.title')}
      closable={false}
      maskClosable={false}
      escToExit={false}
      data-testid='agent-action-approval-modal'
      footer={
        <div className='flex justify-end gap-8px'>
          <Button
            data-testid='agent-action-approval-deny'
            loading={submitting === 'deny'}
            disabled={submitting !== null}
            onClick={() => void decide('deny')}
          >
            {t('tools.agentApproval.deny')}
          </Button>
          <Button
            type='primary'
            status='warning'
            data-testid='agent-action-approval-approve'
            loading={submitting === 'approve'}
            disabled={submitting !== null}
            onClick={() => void decide('approve')}
          >
            {t('tools.agentApproval.approve')}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-12px'>
        <div className='text-14px text-t-primary'>{t('tools.agentApproval.description')}</div>
        <div className='flex items-center gap-8px flex-wrap'>
          <Tag color='orangered'>{t(`tools.agentApproval.kind.${current.kind}`)}</Tag>
          <code className='text-12px text-t-secondary break-all'>
            {current.method} {current.path}
          </code>
        </div>
        <div className='text-12px text-t-secondary break-all'>
          {t('tools.agentApproval.conversation', { id: current.conversation_id })}
        </div>
        {current.summary ? (
          <pre className='m-0 max-h-240px overflow-auto rounded-8px bg-fill-2 p-8px text-12px whitespace-pre-wrap break-all'>
            {current.summary}
          </pre>
        ) : null}
        <div className='text-12px text-t-secondary'>
          {t('tools.agentApproval.expires', { time: expiresAt })}
          {queue.length > 1 ? ` · ${t('tools.agentApproval.morePending', { count: queue.length - 1 })}` : ''}
        </div>
      </div>
    </Modal>
  );
};

export default AgentActionApprovalHost;
