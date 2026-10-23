/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  describePublishError,
  isCommitMessageValid,
  publishRemote,
  RPC_METHOD_NOT_FOUND,
  SCM_ERR_CAPABILITY_UNSUPPORTED,
  SCM_ERR_COMMIT_HOOK_FAILED,
  SCM_ERR_COMMIT_IDENTITY_MISSING,
  SCM_ERR_OPERATION_FAILED,
  SCM_ERR_PUSH_AUTH_FAILED,
  SCM_ERR_PUSH_REJECTED,
  type ScmPublishPort,
} from '@/renderer/pages/conversation/SourceControl/publish/scmPublishModel';
import {
  applyScmProgress,
  commitStaged,
  configureScmPublish,
  getScmPublishState,
  loadRemoteInfo,
  pushBranch,
  resetScmPublishForTest,
  retryPush,
  setCommitDraft,
  setNoVerify,
} from '@/renderer/pages/conversation/SourceControl/publish/scmPublishStore';
import { RpcError } from '@/renderer/pages/conversation/explorer/monitorClient';

describe('describePublishError', () => {
  it('surfaces hook output verbatim and allows a retry', () => {
    const f = describePublishError(
      new RpcError({
        code: SCM_ERR_COMMIT_HOOK_FAILED,
        message: 'COMMIT_HOOK_FAILED',
        data: { output: 'lint failed\n' },
      }),
      'commit'
    );
    expect(f).toEqual({ key: 'hookFailed', detail: 'lint failed\n', retryable: true });
  });

  it('does not offer a retry for a missing identity', () => {
    const f = describePublishError(
      new RpcError({
        code: SCM_ERR_COMMIT_IDENTITY_MISSING,
        message: 'x',
        data: { message: 'Please tell me who you are' },
      }),
      'commit'
    );
    expect(f.key).toBe('identityMissing');
    expect(f.retryable).toBe(false);
    expect(f.detail).toContain('who you are');
  });

  it('maps rejected and auth failures distinctly, with the remote text', () => {
    expect(
      describePublishError(
        new RpcError({ code: SCM_ERR_PUSH_REJECTED, message: 'x', data: { message: '! [rejected]' } }),
        'push'
      )
    ).toEqual({ key: 'pushRejected', detail: '! [rejected]', retryable: true });
    expect(
      describePublishError(
        new RpcError({ code: SCM_ERR_PUSH_AUTH_FAILED, message: 'x', data: { message: '403' } }),
        'push'
      ).key
    ).toBe('pushAuthFailed');
  });

  it('treats method-not-found and capability-unsupported as "unsupported"', () => {
    expect(describePublishError(new RpcError({ code: RPC_METHOD_NOT_FOUND, message: 'm' }), 'commit').key).toBe(
      'unsupported'
    );
    expect(
      describePublishError(new RpcError({ code: SCM_ERR_CAPABILITY_UNSUPPORTED, message: 'm' }), 'commit').key
    ).toBe('unsupported');
  });

  it('never claims a lost-answer commit failed, and never offers a blind retry', () => {
    const f = describePublishError(new RpcError({ code: -2, message: 'reconnected', transport: true }), 'commit');
    expect(f).toEqual({ key: 'outcomeUnknown', retryable: false });
    expect(describePublishError(new RpcError({ code: -1, message: 'down', transport: true }), 'commit').key).toBe(
      'notSent'
    );
  });

  it('reports busy distinctly', () => {
    const f = describePublishError(
      new RpcError({ code: SCM_ERR_OPERATION_FAILED, message: 'x', data: { context: 'busy', message: 'busy' } }),
      'push'
    );
    expect(f).toEqual({ key: 'busy', retryable: false });
  });
});

describe('message validation and remote choice', () => {
  it('rejects blank and NUL messages', () => {
    expect(isCommitMessageValid('  \n')).toBe(false);
    expect(isCommitMessageValid('a\0b')).toBe(false);
    expect(isCommitMessageValid('fix: x')).toBe(true);
    expect(isCommitMessageValid('x'.repeat(64 * 1024 + 1))).toBe(false);
  });

  it('prefers origin, else the single remote', () => {
    const r = (name: string) => ({ name, url_redacted: '', provider: 'local' });
    expect(publishRemote({ remotes: [r('up'), r('origin')] })).toBe('origin');
    expect(publishRemote({ remotes: [r('up')] })).toBe('up');
    expect(publishRemote({ remotes: [r('a'), r('b')] })).toBeUndefined();
  });
});

describe('publish store', () => {
  const calls: Array<{ method: string; params: unknown }> = [];
  let pushImpl: () => Promise<unknown> = async () => ({ remote: 'origin', branch: 'main', ahead: 0 });

  const port: ScmPublishPort = {
    commit: async (params) => {
      calls.push({ method: 'commit', params });
      return { commit_sha: 'abcdef1234567' };
    },
    push: async (params) => {
      calls.push({ method: 'push', params });
      return (await pushImpl()) as never;
    },
    remoteInfo: async () => ({ remotes: [], commit_hooks: [] }),
  };

  beforeEach(() => {
    resetScmPublishForTest();
    calls.length = 0;
    pushImpl = async () => ({ remote: 'origin', branch: 'main', ahead: 0 });
    configureScmPublish(port);
  });

  it('commits the draft with amend:false, clears it and resets --no-verify', async () => {
    setCommitDraft('r', 'feat: a');
    setNoVerify('r', true);
    expect(await commitStaged('r')).toBe(true);
    expect(calls[0]).toEqual({
      method: 'commit',
      params: { repository: 'r', message: 'feat: a', amend: false, no_verify: true },
    });
    const s = getScmPublishState('r');
    expect(s.draft).toBe('');
    expect(s.noVerify).toBe(false);
    expect(s.report).toEqual({ kind: 'committed', sha: 'abcdef1234567' });
  });

  it('omits no_verify unless asked', async () => {
    setCommitDraft('r', 'feat: a');
    await commitStaged('r');
    expect(calls[0].params).not.toHaveProperty('no_verify');
  });

  it('applies progress only while pushing, and retries the exact confirmed push', async () => {
    applyScmProgress({ repository: 'r', phase: 'Writing objects', percent: 10 });
    expect(getScmPublishState('r').progress).toBeUndefined(); // not pushing → residue dropped

    let release: () => void = () => {};
    pushImpl = () =>
      new Promise((_, reject) => {
        release = () =>
          reject(new RpcError({ code: SCM_ERR_PUSH_REJECTED, message: 'x', data: { message: 'non-fast-forward' } }));
      });
    const done = pushBranch('r', { remote: 'origin', setUpstream: true });
    applyScmProgress({ repository: 'r', phase: 'Writing objects', percent: 140 });
    expect(getScmPublishState('r').progress).toEqual({ phase: 'Writing objects', percent: 100 });
    release();
    expect(await done).toBe(false);
    expect(getScmPublishState('r').report).toMatchObject({
      kind: 'failed',
      op: 'push',
      failure: { key: 'pushRejected' },
    });

    pushImpl = async () => ({ remote: 'origin', branch: 'main', ahead: 0 });
    expect(await retryPush('r')).toBe(true);
    expect(calls.map((c) => c.params)).toEqual([
      { repository: 'r', remote: 'origin', set_upstream: true },
      { repository: 'r', remote: 'origin', set_upstream: true },
    ]);
  });

  it('marks an old Core unsupported on method-not-found', async () => {
    configureScmPublish({
      ...port,
      remoteInfo: async () => {
        throw new RpcError({ code: RPC_METHOD_NOT_FOUND, message: 'method_not_found' });
      },
    });
    await loadRemoteInfo('r');
    expect(getScmPublishState('r').remote).toBe('unsupported');
  });
});
