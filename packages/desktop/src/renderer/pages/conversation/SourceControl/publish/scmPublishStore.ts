/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Commit / push state, per repository (M7 E4-4).
 *
 * Module-level like `scmStore`: the draft message survives the panel being
 * closed and reopened, and a push started before a re-render keeps its progress.
 * Status itself is NOT held here — Core broadcasts `scm/statusChanged` after a
 * commit/push and the main store applies it; this store only owns the request
 * lifecycle, the remote summary and the last report.
 */

import { useSyncExternalStore } from 'react';

import {
  type ScmProgress,
  type ScmPublishFailure,
  type ScmPublishPort,
  type ScmRemoteInfo,
  describePublishError,
  isUnsupportedError,
  publishRemote,
  shortSha,
} from './scmPublishModel';

export type ScmPublishPhase = 'idle' | 'committing' | 'pushing';

export type ScmPublishReport =
  | { kind: 'committed'; sha: string }
  | { kind: 'pushed'; remote: string; branch: string }
  | { kind: 'failed'; op: 'commit' | 'push'; failure: ScmPublishFailure };

export type ScmRepoPublishState = {
  draft: string;
  noVerify: boolean;
  phase: ScmPublishPhase;
  progress?: { phase: string; percent?: number };
  /** `undefined` = not loaded yet; `'unsupported'` = this Core has no `scm/remoteInfo`. */
  remote?: ScmRemoteInfo | 'unsupported';
  report?: ScmPublishReport;
  /** What Retry re-sends after a failed push. */
  lastPush?: { remote?: string; setUpstream: boolean };
};

const EMPTY: ScmRepoPublishState = { draft: '', noVerify: false, phase: 'idle' };

let port: ScmPublishPort | null = null;
let states = new Map<string, ScmRepoPublishState>();
const listeners = new Set<() => void>();
let version = 0;

const emit = (): void => {
  version += 1;
  for (const l of listeners) l();
};

const get = (repoId: string): ScmRepoPublishState => states.get(repoId) ?? EMPTY;

const patch = (repoId: string, next: Partial<ScmRepoPublishState>): void => {
  states = new Map(states);
  states.set(repoId, { ...get(repoId), ...next });
  emit();
};

export const configureScmPublish = (next: ScmPublishPort | null): void => {
  port = next;
};

export const getScmPublishState = (repoId: string): ScmRepoPublishState => get(repoId);

export const useScmPublishState = (repoId: string): ScmRepoPublishState => {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => version,
    () => version
  );
  return get(repoId);
};

export const setCommitDraft = (repoId: string, draft: string): void => patch(repoId, { draft });
export const setNoVerify = (repoId: string, noVerify: boolean): void => patch(repoId, { noVerify });
export const dismissPublishReport = (repoId: string): void => patch(repoId, { report: undefined });

/** "Stage all and commit" could not stage everything, so no commit was attempted. */
export const reportStageFailure = (repoId: string): void =>
  patch(repoId, { report: { kind: 'failed', op: 'commit', failure: { key: 'stageFailed', retryable: false } } });

/** Refresh the remote summary. A Core without the method degrades to `'unsupported'`. */
export const loadRemoteInfo = async (repoId: string): Promise<void> => {
  if (!port) return;
  try {
    const info = await port.remoteInfo(repoId);
    patch(repoId, { remote: info });
  } catch (error) {
    // Keep the last good summary on a transient failure; only a definite
    // "no such method / capability" switches the bar off.
    if (isUnsupportedError(error)) patch(repoId, { remote: 'unsupported' });
  }
};

/** Commit what is staged. Returns whether a commit was created. */
export const commitStaged = async (repoId: string): Promise<boolean> => {
  const state = get(repoId);
  if (!port || state.phase !== 'idle') return false;
  patch(repoId, { phase: 'committing', report: undefined });
  try {
    const { commit_sha } = await port.commit({
      repository: repoId,
      message: state.draft,
      amend: false,
      ...(state.noVerify ? { no_verify: true } : {}),
    });
    // The draft is consumed; `noVerify` resets so a skipped hook is never sticky.
    patch(repoId, { phase: 'idle', draft: '', noVerify: false, report: { kind: 'committed', sha: commit_sha } });
    void loadRemoteInfo(repoId);
    return true;
  } catch (error) {
    patch(repoId, {
      phase: 'idle',
      report: { kind: 'failed', op: 'commit', failure: describePublishError(error, 'commit') },
    });
    return false;
  }
};

/** Push the current branch. `setUpstream` must only be true after the user confirmed it. */
export const pushBranch = async (repoId: string, opts: { remote?: string; setUpstream: boolean }): Promise<boolean> => {
  if (!port || get(repoId).phase !== 'idle') return false;
  patch(repoId, { phase: 'pushing', progress: undefined, report: undefined, lastPush: opts });
  try {
    const result = await port.push({
      repository: repoId,
      ...(opts.remote ? { remote: opts.remote } : {}),
      ...(opts.setUpstream ? { set_upstream: true } : {}),
    });
    patch(repoId, {
      phase: 'idle',
      progress: undefined,
      report: { kind: 'pushed', remote: result.remote, branch: result.branch },
    });
    void loadRemoteInfo(repoId);
    return true;
  } catch (error) {
    patch(repoId, {
      phase: 'idle',
      progress: undefined,
      report: { kind: 'failed', op: 'push', failure: describePublishError(error, 'push') },
    });
    void loadRemoteInfo(repoId);
    return false;
  }
};

/** Re-send the last push exactly as confirmed. */
export const retryPush = (repoId: string): Promise<boolean> => {
  const last = get(repoId).lastPush;
  return last ? pushBranch(repoId, last) : Promise.resolve(false);
};

/** `scm/progress` sink. Frames for a repo that is not pushing are late residue → dropped. */
export const applyScmProgress = (params: unknown): void => {
  const p = params as ScmProgress | undefined;
  if (!p?.repository || typeof p.phase !== 'string') return;
  if (get(p.repository).phase !== 'pushing') return;
  const percent = typeof p.percent === 'number' ? Math.max(0, Math.min(100, p.percent)) : undefined;
  patch(p.repository, { progress: { phase: p.phase, percent } });
};

/** What the first push of an untracked branch targets, for the confirmation copy. */
export const upstreamTarget = (repoId: string): { remote: string; branch: string } | undefined => {
  const remote = get(repoId).remote;
  if (!remote || remote === 'unsupported' || !remote.branch) return undefined;
  const name = publishRemote(remote);
  return name ? { remote: name, branch: remote.branch } : undefined;
};

export { shortSha };

export const resetScmPublishForTest = (): void => {
  port = null;
  states = new Map();
  listeners.clear();
  version = 0;
};
