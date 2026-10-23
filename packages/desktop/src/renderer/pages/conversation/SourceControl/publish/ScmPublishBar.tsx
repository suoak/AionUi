/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Progress, Tooltip } from '@arco-design/web-react';
import { Upload } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { upstreamTarget } from './scmPublishStore';
import type { ScmPublishControls } from './useScmPublish';

/**
 * Branch tracking line + push. An untracked branch shows "publish branch", which
 * confirms `origin/<branch>` before setting the upstream. While pushing it shows
 * git's progress phase and percentage (`scm/progress`, this session only).
 */
export const ScmPublishBar: React.FC<{ repoId: string; controls: ScmPublishControls }> = ({ repoId, controls }) => {
  const { t } = useTranslation();
  const { state, upstream, ahead, behind, branch, detached, hasRemote, push } = controls;
  const pushing = state.phase === 'pushing';
  const target = upstream ? undefined : upstreamTarget(repoId);

  let hint: string | undefined;
  if (detached) hint = t('conversation.explorer.scm.publish.detached');
  else if (!hasRemote) hint = t('conversation.explorer.scm.publish.noRemote');
  else if (!upstream && !target) hint = t('conversation.explorer.scm.publish.noDefaultRemote');
  const disabled = !!hint || state.phase !== 'idle';

  const tracking = upstream
    ? t('conversation.explorer.scm.publish.tracking', { upstream, ahead: ahead ?? 0, behind: behind ?? 0 })
    : t('conversation.explorer.scm.publish.untracked', { branch: branch ?? '' });

  return (
    <div data-scm-publish-bar className='flex flex-col gap-4px'>
      <div className='flex items-center justify-between gap-8px text-12px text-t-secondary'>
        <span data-scm-tracking className='truncate' title={tracking}>
          {tracking}
        </span>
        <Tooltip content={hint} disabled={!hint}>
          <Button
            data-scm-push-button
            size='mini'
            icon={<Upload theme='outline' size='12' />}
            loading={pushing}
            disabled={disabled}
            onClick={push}
          >
            {upstream
              ? t('conversation.explorer.scm.publish.push')
              : t('conversation.explorer.scm.publish.publishBranch')}
          </Button>
        </Tooltip>
      </div>
      {pushing && (
        <div data-scm-push-progress className='flex flex-col gap-2px text-12px text-t-secondary'>
          <span className='truncate'>{state.progress?.phase ?? t('conversation.explorer.scm.publish.pushing')}</span>
          {state.progress?.percent !== undefined && (
            <Progress size='small' percent={Math.round(state.progress.percent)} showText={false} />
          )}
        </div>
      )}
    </div>
  );
};
