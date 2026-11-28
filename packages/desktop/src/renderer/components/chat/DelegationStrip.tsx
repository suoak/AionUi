/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Delegation } from '@/common/types/delegation';
import { Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useInRouterContext, useNavigate } from 'react-router-dom';

type Props = {
  items: Delegation[];
  /** id → display name; falls back to the id. */
  assistantName?: (id: string) => string;
};

const STATUS_DOT: Record<string, string> = {
  starting: 'bg-[rgb(var(--primary-6))]',
  running: 'bg-[rgb(var(--primary-6))] animate-pulse',
  completed: 'bg-[rgb(var(--success-6))]',
  failed: 'bg-[rgb(var(--danger-6))]',
};

const VISIBLE = 3;

/** Separate component so `useNavigate` only runs inside a router. */
const OpenChildLink: React.FC<{ delegation: Delegation; label: string }> = ({ delegation, label }) => {
  const navigate = useNavigate();
  return (
    <button
      type='button'
      className='shrink-0 bg-transparent border-none p-0 cursor-pointer text-12px text-[rgb(var(--primary-6))] hover:underline'
      data-testid={`delegation-open-${delegation.id}`}
      onClick={() => navigate(`/conversation/${delegation.child_conversation_id}`)}
    >
      {label}
    </button>
  );
};

/**
 * 3.0 U7: one row per delegation the agent started from this conversation —
 * who got it, the task, its state, and a link into the child conversation.
 * Nothing shows until there is a delegation.
 */
const DelegationStrip: React.FC<Props> = ({ items, assistantName = (id) => id }) => {
  const { t } = useTranslation();
  const inRouter = useInRouterContext();
  if (items.length === 0) return null;
  const rows = items.toSorted((a, b) => b.created_at - a.created_at).slice(0, VISIBLE);
  return (
    <div
      className='flex flex-col gap-4px mb-8px'
      data-testid='delegation-strip'
      aria-label={t('messages.delegation.title')}
    >
      {rows.map((d) => (
        <div
          key={d.id}
          className='flex items-center gap-8px min-w-0 px-10px py-6px rd-8px bg-fill-1 text-12px'
          data-testid={`delegation-row-${d.id}`}
          data-status={d.status}
        >
          <span className={classNames('shrink-0 w-6px h-6px rd-full', STATUS_DOT[d.status] ?? 'bg-fill-4')} />
          <span className='shrink-0 font-medium text-t-primary'>@{assistantName(d.assistant_id)}</span>
          <Tooltip content={d.status === 'failed' && d.error ? d.error : d.task_text}>
            <span className='min-w-0 flex-1 truncate text-t-secondary'>
              {d.status === 'failed' && d.error ? d.error : d.task_text}
            </span>
          </Tooltip>
          <span className='shrink-0 text-t-tertiary'>
            {t(`messages.delegation.status.${d.status}`, { defaultValue: d.status })}
          </span>
          {d.child_conversation_id && inRouter ? (
            <OpenChildLink delegation={d} label={t('messages.delegation.open')} />
          ) : null}
        </div>
      ))}
      {items.length > VISIBLE ? (
        <div className='text-12px text-t-tertiary ps-10px'>
          {t('messages.delegation.more', { count: items.length - VISIBLE })}
        </div>
      ) : null}
    </div>
  );
};

export default DelegationStrip;
