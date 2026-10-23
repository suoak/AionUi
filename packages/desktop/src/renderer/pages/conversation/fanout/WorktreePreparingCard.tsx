/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Progress } from '@arco-design/web-react';
import { BranchOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { WorktreePreparationState } from './useWorktreePreparation';
import { worktreeErrorKey } from './worktreeModel';

type WorktreePreparingCardProps = {
  state: WorktreePreparationState;
  onCancel: () => void;
  onRetry: () => void;
  onDiscard: () => void;
};

/**
 * Progress for the worktree a new conversation will run in. Core binds a
 * conversation only to a `ready` worktree, so the Guid page waits here
 * (cancel while creating; retry / discard after a failure).
 */
const WorktreePreparingCard: React.FC<WorktreePreparingCardProps> = ({ state, onCancel, onRetry, onDiscard }) => {
  const { t } = useTranslation();
  if (state.kind === 'idle') return null;

  const branch = state.worktree.branch;
  if (state.kind === 'failed') {
    return (
      <div
        className='mx-14px mb-10px flex flex-col gap-8px rd-8px border border-solid border-danger-3 bg-danger-1 px-12px py-10px'
        data-testid='worktree-preparing-card'
        role='alert'
      >
        <div className='flex items-center gap-6px text-13px font-medium text-danger-6'>
          <BranchOne theme='outline' size='14' fill='currentColor' />
          <span>{t('conversation.worktree.createFailed', { branch })}</span>
        </div>
        <span className='text-12px text-t-secondary'>
          {t(worktreeErrorKey(state.code), { defaultValue: state.message })}
        </span>
        {state.message && <span className='break-all text-11px text-t-tertiary'>{state.message}</span>}
        <div className='flex justify-end gap-8px'>
          <Button size='mini' onClick={onDiscard}>
            {t('conversation.worktree.discard')}
          </Button>
          <Button size='mini' type='primary' onClick={onRetry}>
            {t('conversation.worktree.retry')}
          </Button>
        </div>
      </div>
    );
  }

  const percent = state.progress?.percent;
  return (
    <div
      className='mx-14px mb-10px flex flex-col gap-6px rd-8px border border-solid border-border-2 bg-fill-1 px-12px py-10px'
      data-testid='worktree-preparing-card'
      aria-live='polite'
    >
      <div className='flex items-center gap-6px text-13px text-t-primary'>
        <BranchOne theme='outline' size='14' fill='currentColor' />
        <span className='min-w-0 flex-1 truncate'>{t('conversation.worktree.preparing', { branch })}</span>
        <Button size='mini' type='text' loading={state.cancelling} onClick={onCancel}>
          {t('conversation.worktree.cancel')}
        </Button>
      </div>
      <Progress
        size='small'
        percent={typeof percent === 'number' ? Math.round(percent) : 0}
        status={typeof percent === 'number' ? 'normal' : undefined}
        showText={typeof percent === 'number'}
        animation
      />
      {state.progress?.message && <span className='truncate text-11px text-t-tertiary'>{state.progress.message}</span>}
    </div>
  );
};

export default WorktreePreparingCard;
