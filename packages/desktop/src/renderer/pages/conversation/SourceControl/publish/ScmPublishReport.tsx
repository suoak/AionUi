/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { shortSha } from './scmPublishModel';
import { dismissPublishReport } from './scmPublishStore';
import type { ScmPublishControls } from './useScmPublish';

/**
 * Outcome of the last commit/push. A failure shows git's own text verbatim
 * (hook output, remote rejection — already redacted and clipped by Core) and a
 * Retry only where retrying can help.
 */
export const ScmPublishReport: React.FC<{ repoId: string; controls: ScmPublishControls }> = ({ repoId, controls }) => {
  const { t } = useTranslation();
  const report = controls.state.report;
  if (!report) return null;

  const failure = report.kind === 'failed' ? report.failure : undefined;
  let title: string;
  if (report.kind === 'committed')
    title = t('conversation.explorer.scm.publish.committed', { sha: shortSha(report.sha) });
  else if (report.kind === 'pushed')
    title = t('conversation.explorer.scm.publish.pushed', { remote: report.remote, branch: report.branch });
  else title = t(`conversation.explorer.scm.publish.errors.${report.failure.key}`);

  return (
    <div
      data-scm-publish-report={failure ? failure.key : 'ok'}
      role={failure ? 'alert' : 'status'}
      className={`flex flex-col gap-4px rd-4px px-8px py-6px text-12px bg-fill-2 ${failure ? 'text-danger' : 'text-success'}`}
    >
      <div className='flex items-start justify-between gap-6px'>
        <span className='break-words'>{title}</span>
        <Button
          size='mini'
          type='text'
          aria-label={t('conversation.explorer.scm.publish.dismiss')}
          icon={<Close theme='outline' size='12' />}
          onClick={() => dismissPublishReport(repoId)}
        />
      </div>
      {failure?.detail && (
        <pre
          data-scm-publish-output
          className='m-0 max-h-160px overflow-auto whitespace-pre-wrap break-all font-mono text-11px text-t-primary'
        >
          {failure.detail}
        </pre>
      )}
      {failure?.retryable && (
        <div>
          <Button
            data-scm-publish-retry
            size='mini'
            disabled={controls.state.phase !== 'idle'}
            onClick={controls.retry}
          >
            {t('conversation.explorer.scm.publish.retry')}
          </Button>
        </div>
      )}
    </div>
  );
};
