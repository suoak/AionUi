/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

import { ScmPullRequestEntry } from '../delivery/ScmPullRequestEntry';
import type { ScmRepository, ScmStatus } from '../scmModel';
import { ScmCommitBox } from './ScmCommitBox';
import { ScmPublishBar } from './ScmPublishBar';
import { ScmPublishReport } from './ScmPublishReport';
import { useScmPublish } from './useScmPublish';

/**
 * Commit box + publish bar above the Changes list. Renders nothing on a Core
 * without `capabilities.commit` (graceful degradation: the panel looks exactly
 * as it did before E4-4), and drops the publish bar when Core lacks remote ops
 * or answers `scm/remoteInfo` with method-not-found.
 */
export const ScmPublishArea: React.FC<{ repo: ScmRepository; status: ScmStatus | undefined }> = ({ repo, status }) => {
  const controls = useScmPublish(repo, status);
  if (!controls.showCommit) return null;
  return (
    <div data-scm-publish-area className='flex flex-col gap-6px px-4px pt-4px pb-6px'>
      <ScmCommitBox repoId={repo.repo_id} controls={controls} />
      {controls.showPublish && <ScmPublishBar repoId={repo.repo_id} controls={controls} />}
      {controls.showPublish && (
        <ScmPullRequestEntry repo={repo} status={status} upstream={controls.upstream} detached={controls.detached} />
      )}
      <ScmPublishReport repoId={repo.repo_id} controls={controls} />
    </div>
  );
};
