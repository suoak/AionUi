/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Commit / push wire shapes and the pure decisions around them (M7 E4-4).
 *
 * Kept free of React and of the store so the error mapping — the part that has
 * to be right — is unit-tested on its own: which failures show git's raw text,
 * which may offer a retry, and which mean "this Core cannot do it" (graceful
 * degradation on a Core that predates `scm/commit`).
 */

import type { ScmRepository } from '../scmModel';

/** `scm/remoteInfo` → one remote. `url_redacted` never carries credentials. */
export type ScmRemote = {
  name: string;
  url_redacted: string;
  provider: 'github' | 'gitlab' | 'local' | 'other' | string;
};

export type ScmRemoteInfo = {
  remotes: ScmRemote[];
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  /** Commit hooks git would run (`pre-commit`, `commit-msg`, …). */
  commit_hooks?: string[];
};

export type ScmCommitParams = {
  repository: string;
  message: string;
  amend: false;
  signoff?: boolean;
  no_verify?: boolean;
};
export type ScmCommitResult = { commit_sha: string };

export type ScmPushParams = { repository: string; remote?: string; set_upstream?: boolean };
export type ScmPushResult = { remote: string; branch: string; upstream?: string; ahead: number };

/** `scm/progress` notification params. */
export type ScmProgress = { repository: string; phase: string; percent?: number };

/** The request side the publish store talks through (wired in `scmTransport`). */
export type ScmPublishPort = {
  commit: (params: ScmCommitParams) => Promise<ScmCommitResult>;
  push: (params: ScmPushParams) => Promise<ScmPushResult>;
  remoteInfo: (repoId: string) => Promise<ScmRemoteInfo>;
};

// Protocol codes (aioncore `scm/wire.rs`).
export const SCM_ERR_OPERATION_FAILED = -32051;
export const SCM_ERR_CAPABILITY_UNSUPPORTED = -32052;
export const SCM_ERR_COMMIT_NOTHING_STAGED = -32054;
export const SCM_ERR_COMMIT_IDENTITY_MISSING = -32055;
export const SCM_ERR_COMMIT_HOOK_FAILED = -32056;
export const SCM_ERR_PUSH_REJECTED = -32057;
export const SCM_ERR_PUSH_AUTH_FAILED = -32058;
export const SCM_ERR_PUSH_NO_UPSTREAM = -32059;
export const SCM_ERR_GIT_NOT_AVAILABLE = -32060;
/** JSON-RPC "method not found": an older Core without the method. */
export const RPC_METHOD_NOT_FOUND = -32601;

/** i18n suffix under `conversation.explorer.scm.publish.errors.*`. */
export type ScmPublishErrorKey =
  | 'nothingStaged'
  | 'stageFailed'
  | 'identityMissing'
  | 'hookFailed'
  | 'pushRejected'
  | 'pushAuthFailed'
  | 'noUpstream'
  | 'gitNotAvailable'
  | 'unsupported'
  | 'busy'
  | 'notSent'
  | 'outcomeUnknown'
  | 'failed';

export type ScmPublishFailure = {
  key: ScmPublishErrorKey;
  /** git's own text (hook output, remote message), shown verbatim. Already redacted by Core. */
  detail?: string;
  /** Whether a Retry button is honest for this failure. */
  retryable: boolean;
};

type ErrorLike = { code?: unknown; message?: unknown; data?: unknown; transport?: unknown };

const asText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

const dataField = (data: unknown, field: string): string | undefined =>
  data && typeof data === 'object' ? asText((data as Record<string, unknown>)[field]) : undefined;

/**
 * Map a failed `scm/commit` / `scm/push` into what the UI says. Never guesses: a
 * transport failure after the frame left means the outcome is unknown, and a
 * commit that may have happened must not be offered as a blind retry.
 */
export const describePublishError = (error: unknown, op: 'commit' | 'push'): ScmPublishFailure => {
  const err = (error ?? {}) as ErrorLike;
  const code = typeof err.code === 'number' ? err.code : undefined;
  if (err.transport === true) {
    // -1 = never sent (socket closed). Anything else = sent, answer lost.
    return code === -1 ? { key: 'notSent', retryable: true } : { key: 'outcomeUnknown', retryable: false };
  }
  switch (code) {
    case SCM_ERR_COMMIT_NOTHING_STAGED:
      return { key: 'nothingStaged', retryable: false };
    case SCM_ERR_COMMIT_IDENTITY_MISSING:
      return { key: 'identityMissing', detail: dataField(err.data, 'message'), retryable: false };
    case SCM_ERR_COMMIT_HOOK_FAILED:
      // Retrying runs the hook again — useful after the user fixes what it flagged.
      return { key: 'hookFailed', detail: dataField(err.data, 'output'), retryable: true };
    case SCM_ERR_PUSH_REJECTED:
      return { key: 'pushRejected', detail: dataField(err.data, 'message'), retryable: true };
    case SCM_ERR_PUSH_AUTH_FAILED:
      return { key: 'pushAuthFailed', detail: dataField(err.data, 'message'), retryable: true };
    case SCM_ERR_PUSH_NO_UPSTREAM:
      return { key: 'noUpstream', retryable: false };
    case SCM_ERR_GIT_NOT_AVAILABLE:
      return { key: 'gitNotAvailable', detail: dataField(err.data, 'message'), retryable: false };
    case SCM_ERR_CAPABILITY_UNSUPPORTED:
    case RPC_METHOD_NOT_FOUND:
      return { key: 'unsupported', retryable: false };
    case SCM_ERR_OPERATION_FAILED: {
      if (dataField(err.data, 'context') === 'busy') return { key: 'busy', retryable: false };
      return { key: 'failed', detail: dataField(err.data, 'message') ?? asText(err.message), retryable: op === 'push' };
    }
    default:
      return { key: 'failed', detail: asText(err.message), retryable: false };
  }
};

/** Whether a failed request means "this Core does not have the method". */
export const isUnsupportedError = (error: unknown): boolean => {
  const code = (error as ErrorLike | undefined)?.code;
  return code === RPC_METHOD_NOT_FOUND || code === SCM_ERR_CAPABILITY_UNSUPPORTED;
};

/** The commit box renders only when Core advertises `capabilities.commit`. */
export const canCommit = (repo: ScmRepository): boolean => repo.capabilities.commit === true;

/** The publish bar additionally needs remote operations. */
export const canPublish = (repo: ScmRepository): boolean => canCommit(repo) && repo.capabilities.remote_ops === true;

export const MAX_MESSAGE_BYTES = 64 * 1024;

/** A message Core would accept: non-blank, no NUL, within the size cap. */
export const isCommitMessageValid = (message: string): boolean =>
  message.trim() !== '' && !message.includes('\0') && new TextEncoder().encode(message).length <= MAX_MESSAGE_BYTES;

/** Short sha for display. */
export const shortSha = (sha: string): string => sha.slice(0, 7);

/** The remote a first push publishes to: `origin` when present, else the only remote. */
export const publishRemote = (info: ScmRemoteInfo | undefined): string | undefined => {
  const names = info?.remotes.map((r) => r.name) ?? [];
  if (names.includes('origin')) return 'origin';
  return names.length === 1 ? names[0] : undefined;
};
