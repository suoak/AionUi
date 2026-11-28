/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ApprovalRequest } from '@/common/types/remoteApproval';
import { Alert, Typography } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { latestRequest, minutesLeft, remoteApprovalView } from './remoteApprovalModel';

const TICK_MS = 30_000;

/**
 * 3.0 U9: the newest remote approval request on a task — what it approves
 * (summary), how long it stays answerable, and what happened: approved on a
 * phone or in IM and ran, did not run (Core's error), rejected, expired or
 * voided.
 */
const RemoteApprovalCard: React.FC<{ requests: readonly ApprovalRequest[] | null; now?: () => number }> = ({
  requests,
  now = Date.now,
}) => {
  const { t } = useTranslation();
  const [clock, setClock] = useState(() => now());
  const request = latestRequest(requests);
  const pending = request?.status === 'pending';
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(() => setClock(now()), TICK_MS);
    return () => clearInterval(timer);
  }, [pending, now]);
  if (!request) return null;
  const view = remoteApprovalView(request, clock);
  const where = view.decider ? t(`conversation.taskBoard.remote.where.${view.decider}`) : '';
  const summary =
    request.kind === 'adopt'
      ? t('conversation.taskBoard.remote.summary.adopt', {
          strategy: request.strategy ?? 'squash',
          target: request.target_branch ?? '',
        })
      : t(`conversation.taskBoard.remote.summary.${request.kind}`);
  const title = t(`conversation.taskBoard.remote.state.${view.state}`, {
    where,
    minutes: minutesLeft(request.expires_at, clock),
    time: new Date(request.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });
  const detail =
    view.state === 'approvedFailed'
      ? request.error
      : view.reasonKey
        ? t(view.reasonKey)
        : view.state === 'approvedRan' && request.kind === 'adopt' && request.result_ref
          ? t('conversation.taskBoard.remote.commit', { ref: request.result_ref.slice(0, 12) })
          : null;
  return (
    <div data-testid='task-remote-approval' data-state={view.state}>
      <Typography.Text type='secondary' className='text-12px block mb-4px'>
        {t('conversation.taskBoard.remote.title')} · {summary}
      </Typography.Text>
      <Alert
        type={view.tone}
        content={
          <span>
            <span data-testid='task-remote-approval-status'>{title}</span>
            {detail ? <span className='block text-12px opacity-80 mt-2px break-words'>{detail}</span> : null}
          </span>
        }
      />
    </div>
  );
};

export default RemoteApprovalCard;
