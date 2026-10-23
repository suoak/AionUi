/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { AnnotatableDiff } from '@/renderer/pages/conversation/Preview/components/annotate';
import { Button, Empty, Spin } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

type FanoutFileDiffProps = {
  /** The slot's managed worktree. */
  worktreeId: string;
  slot: string;
  path: string;
  /** Changes when the group changes so the diff is refetched. */
  version?: number;
  onClose: () => void;
};

/**
 * One slot's diff of one file against the group's base commit, rendered with
 * the E4 diff component (read-only: fan-out slots have no review scope yet).
 */
const FanoutFileDiff: React.FC<FanoutFileDiffProps> = ({ worktreeId, slot, path, version, onClose }) => {
  const { t } = useTranslation();
  const { data, error, isLoading } = useSWR(
    ['fanout.fileDiff', worktreeId, path, version ?? 0],
    ([, id, file]: [string, string, string, number]) => ipcBridge.worktree.diff.invoke({ id, path: file }),
    { revalidateOnFocus: false }
  );

  let body: React.ReactNode;
  if (isLoading && !data) body = <Spin className='m-16px' />;
  else if (error || !data) body = <Empty description={t('conversation.fanout.diffUnavailable')} />;
  else if (data.binary) body = <Empty description={t('conversation.fanout.diffBinary')} />;
  else if (!data.patch.trim()) body = <Empty description={t('conversation.fanout.diffEmpty')} />;
  else body = <AnnotatableDiff patch={data.patch} readOnly />;

  return (
    <div
      className='flex max-h-480px flex-col overflow-hidden rd-6px b-1 b-solid b-[var(--color-border-2)]'
      data-testid='fanout-file-diff'
    >
      <div className='flex items-center gap-8px px-10px py-6px text-12px text-t-secondary b-b-1 b-b-solid b-[var(--color-border-1)]'>
        <span className='font-medium text-t-primary'>{slot}</span>
        <span className='min-w-0 flex-1 truncate font-mono' title={path}>
          {path}
        </span>
        {data?.truncated && <span>{t('conversation.fanout.diffTruncated')}</span>}
        <Button
          size='mini'
          type='text'
          icon={<Close theme='outline' size='12' />}
          aria-label={t('conversation.fanout.closeDiff')}
          onClick={onClose}
        />
      </div>
      <div className='min-h-0 flex-1 overflow-auto'>{body}</div>
    </div>
  );
};

export default FanoutFileDiff;
