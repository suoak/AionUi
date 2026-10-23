/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Commit / push orchestration for one repository (M7 E4-4, source-control §2.3).
 *
 * The two confirmations live here, not in the store, because they are UI policy:
 *  - committing with nothing staged asks "stage all and commit?" — it never
 *    silently widens what goes into the commit;
 *  - the first push of an untracked branch asks before `set_upstream: true`
 *    — it never silently creates a remote branch.
 */

import { Modal } from '@arco-design/web-react';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { stageAllTargets } from '../ScmChangesView';
import type { ScmRepository, ScmStatus } from '../scmModel';
import { runScmAction } from '../scmStore';
import { canCommit, canPublish, isCommitMessageValid } from './scmPublishModel';
import {
  commitStaged,
  loadRemoteInfo,
  pushBranch,
  reportStageFailure,
  retryPush,
  type ScmRepoPublishState,
  upstreamTarget,
  useScmPublishState,
} from './scmPublishStore';

export type ScmPublishControls = {
  state: ScmRepoPublishState;
  showCommit: boolean;
  showPublish: boolean;
  stagedCount: number;
  canSubmit: boolean;
  hooks: string[];
  /** Upstream tracking, preferring the live status frame over the remote summary. */
  upstream?: string;
  ahead?: number;
  behind?: number;
  branch?: string;
  detached: boolean;
  hasRemote: boolean;
  commit: () => void;
  push: () => void;
  retry: () => void;
};

export const useScmPublish = (repo: ScmRepository, status: ScmStatus | undefined): ScmPublishControls => {
  const { t } = useTranslation();
  const repoId = repo.repo_id;
  const state = useScmPublishState(repoId);
  const showCommit = canCommit(repo);
  const showPublish = canPublish(repo) && state.remote !== 'unsupported';
  const remote = state.remote === 'unsupported' ? undefined : state.remote;

  useEffect(() => {
    if (showCommit) void loadRemoteInfo(repoId);
  }, [repoId, showCommit]);

  const staging = repo.capabilities.staging;
  const stagedCount = useMemo(
    () => (status?.resources ?? []).filter((r) => r.staged === true).length,
    [status?.resources]
  );
  const stageTargets = useMemo(() => stageAllTargets(status, staging), [status, staging]);
  const head = status?.head;
  const upstream = head?.upstream ?? remote?.upstream;
  const ahead = head?.ahead ?? remote?.ahead;
  const behind = head?.behind ?? remote?.behind;
  const branch = head?.name ?? remote?.branch;
  const idle = state.phase === 'idle';
  const hasChanges = !staging || stagedCount > 0 || stageTargets.length > 0;
  const canSubmit = idle && isCommitMessageValid(state.draft) && hasChanges;

  const commit = useCallback(() => {
    if (!canSubmit) return;
    if (!staging || stagedCount > 0) {
      void commitStaged(repoId);
      return;
    }
    Modal.confirm({
      title: t('conversation.explorer.scm.publish.stageAllTitle'),
      content: t('conversation.explorer.scm.publish.stageAllContent', { count: stageTargets.length }),
      okText: t('conversation.explorer.scm.publish.stageAllOk'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        const outcome = await runScmAction('stage', repoId, stageTargets);
        // Only a clean stage commits: after a partial one the commit would not
        // contain what the user just agreed to.
        if (outcome.kind === 'ok') await commitStaged(repoId);
        else reportStageFailure(repoId);
      },
    });
  }, [canSubmit, staging, stagedCount, stageTargets, repoId, t]);

  const push = useCallback(() => {
    if (!idle) return;
    if (upstream) {
      void pushBranch(repoId, { setUpstream: false });
      return;
    }
    const target = upstreamTarget(repoId);
    if (!target) return;
    Modal.confirm({
      title: t('conversation.explorer.scm.publish.setUpstreamTitle'),
      content: t('conversation.explorer.scm.publish.setUpstreamContent', target),
      okText: t('conversation.explorer.scm.publish.setUpstreamOk'),
      cancelText: t('common.cancel'),
      onOk: () => pushBranch(repoId, { remote: target.remote, setUpstream: true }),
    });
  }, [idle, upstream, repoId, t]);

  const retry = useCallback(() => {
    const report = state.report;
    if (report?.kind !== 'failed') return;
    if (report.op === 'push') void retryPush(repoId);
    else void commitStaged(repoId);
  }, [state.report, repoId]);

  return {
    state,
    showCommit,
    showPublish,
    stagedCount,
    canSubmit,
    hooks: remote?.commit_hooks ?? [],
    upstream,
    ahead,
    behind,
    branch,
    detached: head?.detached === true,
    hasRemote: (remote?.remotes.length ?? 0) > 0,
    commit,
    push,
    retry,
  };
};
