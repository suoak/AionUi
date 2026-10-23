/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure helpers for PR / MR delivery (M7 E4-5). Core runs `gh` / `glab` on the
 * user's machine with the user's own login; the UI only decides what to show:
 * a form, an install guide, a login guide, or nothing on an older Core.
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { ScmHostStatus, TaskEvidence } from '@/common/types/agent/taskSession';

/**
 * Whether this Core has no delivery API at all (an E4-4 or older Core answers its
 * generic 404 / 405 for the unknown route). The PR entry points are then hidden.
 */
export const isDeliveryUnsupported = (error: unknown): boolean =>
  isBackendHttpError(error) &&
  (error.status === 404 || error.status === 405) &&
  error.code !== 'PR_TASK_RUN_NOT_FOUND' &&
  error.code !== 'SCM_DELIVERY_NOT_FOUND';

/** What the dialog shows before the form. */
export type HostReadiness =
  | { kind: 'ready'; cli: 'gh' | 'glab' }
  | { kind: 'notInstalled'; cli: 'gh' | 'glab' }
  | { kind: 'notAuthenticated'; cli: 'gh' | 'glab'; host?: string }
  | { kind: 'unsupportedHost'; host?: string };

export const hostReadiness = (status: ScmHostStatus): HostReadiness => {
  const host = status.host ?? undefined;
  if (status.provider === 'other' || !status.cli) return { kind: 'unsupportedHost', host };
  if (!status.installed) return { kind: 'notInstalled', cli: status.cli };
  if (!status.authenticated) return { kind: 'notAuthenticated', cli: status.cli, host };
  return { kind: 'ready', cli: status.cli };
};

/** Install page + login command per CLI (shown, never run by the UI). */
export const CLI_GUIDE: Record<'gh' | 'glab', { installUrl: string; login: (host?: string) => string }> = {
  gh: {
    installUrl: 'https://cli.github.com/',
    login: (host) => (host && host !== 'github.com' ? `gh auth login --hostname ${host}` : 'gh auth login'),
  },
  glab: {
    installUrl: 'https://gitlab.com/gitlab-org/cli#installation',
    login: (host) => (host && host !== 'gitlab.com' ? `glab auth login --hostname ${host}` : 'glab auth login'),
  },
};

/** i18n key suffix (`conversation.explorer.scm.delivery.errors.*`) for a create failure. */
export type DeliveryErrorKey =
  | 'notInstalled'
  | 'notAuthenticated'
  | 'noRemote'
  | 'providerUnsupported'
  | 'createFailed'
  | 'runNotFound'
  | 'invalid'
  | 'unsupported'
  | 'generic';

export const deliveryErrorKey = (error: unknown): DeliveryErrorKey => {
  if (!isBackendHttpError(error)) return 'generic';
  switch (error.code) {
    case 'PR_CLI_NOT_INSTALLED':
      return 'notInstalled';
    case 'PR_CLI_NOT_AUTHENTICATED':
      return 'notAuthenticated';
    case 'PR_NO_REMOTE':
      return 'noRemote';
    case 'PR_PROVIDER_UNSUPPORTED':
      return 'providerUnsupported';
    case 'PR_CREATE_FAILED':
      return 'createFailed';
    case 'PR_TASK_RUN_NOT_FOUND':
      return 'runNotFound';
    case 'SCM_DELIVERY_BAD_REQUEST':
      return 'invalid';
    default:
      return isDeliveryUnsupported(error) ? 'unsupported' : 'generic';
  }
};

/** CLI output Core already redacted and clipped; only for a failed create. */
export const deliveryErrorDetail = (error: unknown): string | undefined =>
  isBackendHttpError(error) && error.code === 'PR_CREATE_FAILED' && error.backendMessage
    ? error.backendMessage
    : undefined;

export const MAX_TITLE_CHARS = 256;
export const MAX_BODY_BYTES = 24 * 1024;
const BRANCH_RE = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)[^\s~^:?*[\\]+(?<![./])$/;

const hasControlChar = (value: string): boolean => {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
};

export const isBranchNameValid = (name: string): boolean =>
  name.length > 0 && name.length <= 255 && !hasControlChar(name) && BRANCH_RE.test(name);

/** Mirrors Core's validation so the submit button is disabled instead of failing. */
export const isPullRequestFormValid = (form: {
  title: string;
  body: string;
  branch: string;
  base: string;
}): boolean => {
  const title = form.title.trim();
  return (
    title.length > 0 &&
    [...title].length <= MAX_TITLE_CHARS &&
    !hasControlChar(title) &&
    !form.body.includes('\0') &&
    new TextEncoder().encode(form.body).length <= MAX_BODY_BYTES &&
    isBranchNameValid(form.branch) &&
    isBranchNameValid(form.base) &&
    form.branch !== form.base
  );
};

/** A PR / MR link recorded on a TaskRun (`task_evidence.kind = 'artifact'`). */
export type PullRequestEvidence = {
  id: string;
  url: string;
  number?: string;
  title: string;
  provider?: string;
  branch?: string;
  base?: string;
  draft: boolean;
  createdAt: number;
};

const str = (input: unknown): string | undefined => (typeof input === 'string' && input !== '' ? input : undefined);
const SUMMARY_PREFIX = 'Pull request: ';

export const pullRequestEvidence = (evidence: TaskEvidence[]): PullRequestEvidence[] =>
  evidence
    .filter((item) => item.kind === 'artifact' && item.metadata?.type === 'pull_request')
    .flatMap((item) => {
      const url = str(item.metadata.url) ?? str(item.reference);
      // Only http(s) links are rendered as links.
      if (!url || !/^https?:\/\//i.test(url)) return [];
      const number = item.metadata.number;
      return [
        {
          id: item.id,
          url,
          number: typeof number === 'number' ? String(number) : str(number),
          title: item.summary.startsWith(SUMMARY_PREFIX) ? item.summary.slice(SUMMARY_PREFIX.length) : item.summary,
          provider: str(item.metadata.provider),
          branch: str(item.metadata.branch),
          base: str(item.metadata.base),
          draft: item.metadata.draft === true,
          createdAt: item.created_at,
        },
      ];
    });
