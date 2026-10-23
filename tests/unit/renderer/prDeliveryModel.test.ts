/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { TaskEvidence } from '@/common/types/agent/taskSession';
import {
  CLI_GUIDE,
  deliveryErrorDetail,
  deliveryErrorKey,
  hostReadiness,
  isDeliveryUnsupported,
  isPullRequestFormValid,
  pullRequestEvidence,
} from '@/renderer/pages/conversation/SourceControl/delivery/prDeliveryModel';

const httpError = (status: number, code = '', error = '') =>
  new BackendHttpError({ method: 'POST', path: '/api/scm-deliveries/pull-request', status, body: { code, error } });

const host = {
  provider: 'github' as const,
  host: 'github.com',
  cli: 'gh' as const,
  installed: true,
  authenticated: true,
};

describe('hostReadiness', () => {
  it('maps CLI state to the guide to show', () => {
    expect(hostReadiness(host)).toEqual({ kind: 'ready', cli: 'gh' });
    expect(hostReadiness({ ...host, installed: false, authenticated: false })).toEqual({
      kind: 'notInstalled',
      cli: 'gh',
    });
    expect(hostReadiness({ ...host, authenticated: false })).toEqual({
      kind: 'notAuthenticated',
      cli: 'gh',
      host: 'github.com',
    });
    expect(hostReadiness({ ...host, provider: 'other', cli: null, host: 'git.example.com' })).toEqual({
      kind: 'unsupportedHost',
      host: 'git.example.com',
    });
  });

  it('adds --hostname only for self-hosted instances', () => {
    expect(CLI_GUIDE.gh.login('github.com')).toBe('gh auth login');
    expect(CLI_GUIDE.gh.login('ghe.corp')).toBe('gh auth login --hostname ghe.corp');
    expect(CLI_GUIDE.glab.login('gitlab.corp')).toBe('glab auth login --hostname gitlab.corp');
  });
});

describe('delivery errors', () => {
  it('treats a generic 404/405 as an older Core, but not a coded not-found', () => {
    expect(isDeliveryUnsupported(httpError(404))).toBe(true);
    expect(isDeliveryUnsupported(httpError(405))).toBe(true);
    expect(isDeliveryUnsupported(httpError(404, 'PR_TASK_RUN_NOT_FOUND'))).toBe(false);
    expect(isDeliveryUnsupported(new Error('offline'))).toBe(false);
  });

  it('maps Core codes to i18n keys', () => {
    expect(deliveryErrorKey(httpError(409, 'PR_CLI_NOT_INSTALLED'))).toBe('notInstalled');
    expect(deliveryErrorKey(httpError(409, 'PR_CLI_NOT_AUTHENTICATED'))).toBe('notAuthenticated');
    expect(deliveryErrorKey(httpError(409, 'PR_NO_REMOTE'))).toBe('noRemote');
    expect(deliveryErrorKey(httpError(409, 'PR_PROVIDER_UNSUPPORTED'))).toBe('providerUnsupported');
    expect(deliveryErrorKey(httpError(502, 'PR_CREATE_FAILED', 'boom'))).toBe('createFailed');
    expect(deliveryErrorKey(httpError(404, 'PR_TASK_RUN_NOT_FOUND'))).toBe('runNotFound');
    expect(deliveryErrorKey(httpError(400, 'SCM_DELIVERY_BAD_REQUEST'))).toBe('invalid');
    expect(deliveryErrorKey(httpError(404))).toBe('unsupported');
    expect(deliveryErrorKey(new Error('x'))).toBe('generic');
  });

  it('shows CLI output only for a failed create', () => {
    expect(deliveryErrorDetail(httpError(502, 'PR_CREATE_FAILED', 'a pull request already exists'))).toBe(
      'a pull request already exists'
    );
    expect(deliveryErrorDetail(httpError(409, 'PR_NO_REMOTE', 'no remote'))).toBeUndefined();
  });
});

describe('isPullRequestFormValid', () => {
  const ok = { title: 'Fix', body: '', branch: 'feat/x', base: 'main' };
  it('mirrors Core validation', () => {
    expect(isPullRequestFormValid(ok)).toBe(true);
    expect(isPullRequestFormValid({ ...ok, title: '  ' })).toBe(false);
    expect(isPullRequestFormValid({ ...ok, title: 'a\nb' })).toBe(false);
    expect(isPullRequestFormValid({ ...ok, title: 'x'.repeat(257) })).toBe(false);
    expect(isPullRequestFormValid({ ...ok, body: 'x'.repeat(24 * 1024 + 1) })).toBe(false);
    expect(isPullRequestFormValid({ ...ok, body: 'a\0b' })).toBe(false);
    expect(isPullRequestFormValid({ ...ok, branch: 'main' })).toBe(false);
    expect(isPullRequestFormValid({ ...ok, branch: '-x' })).toBe(false);
    expect(isPullRequestFormValid({ ...ok, branch: 'a..b' })).toBe(false);
    expect(isPullRequestFormValid({ ...ok, base: 'has space' })).toBe(false);
  });
});

const evidence = (over: Partial<TaskEvidence>): TaskEvidence => ({
  id: 'e1',
  task_id: 't',
  run_id: 'r',
  kind: 'artifact',
  summary: 'Pull request: Add feature',
  reference: 'https://github.com/o/r/pull/7',
  metadata: {
    type: 'pull_request',
    url: 'https://github.com/o/r/pull/7',
    number: '7',
    provider: 'github',
    branch: 'feat/x',
    base: 'main',
    draft: true,
  },
  created_at: 1,
  ...over,
});

describe('pullRequestEvidence', () => {
  it('extracts PR links recorded on the run', () => {
    expect(pullRequestEvidence([evidence({}), evidence({ id: 'f', kind: 'file', metadata: {} })])).toEqual([
      {
        id: 'e1',
        url: 'https://github.com/o/r/pull/7',
        number: '7',
        title: 'Add feature',
        provider: 'github',
        branch: 'feat/x',
        base: 'main',
        draft: true,
        createdAt: 1,
      },
    ]);
  });

  it('ignores other artifacts and non-http links', () => {
    expect(pullRequestEvidence([evidence({ metadata: { type: 'plan' } })])).toEqual([]);
    expect(
      pullRequestEvidence([
        evidence({ reference: 'javascript:alert(1)', metadata: { type: 'pull_request', url: 'javascript:alert(1)' } }),
      ])
    ).toEqual([]);
  });
});
