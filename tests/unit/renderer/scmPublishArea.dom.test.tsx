/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M7 E4-4 commit box / publish bar inside the Changes panel: graceful degradation
 * on an older Core, the two confirmations (stage-all, set-upstream), the hooks
 * notice, and the raw-output + retry failure path.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScmRepository, ScmResource, ScmStatus } from '@/renderer/pages/conversation/SourceControl/scmModel';
import type { ScmPort } from '@/renderer/pages/conversation/SourceControl/scmStore';
import type {
  ScmPublishPort,
  ScmRemoteInfo,
} from '@/renderer/pages/conversation/SourceControl/publish/scmPublishModel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, unknown>) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
  }),
}));

vi.mock('@/renderer/pages/conversation/SourceControl/scmTransport', () => ({
  initScmRuntime: () => ({}),
}));

const confirmCalls: Array<{ content?: unknown; onOk?: () => unknown }> = [];

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Modal: {
      ...actual.Modal,
      confirm: (cfg: { content?: unknown; onOk?: () => unknown }) => {
        confirmCalls.push(cfg);
        return { close: () => {} };
      },
    },
  };
});

import { ScmPanel } from '@/renderer/pages/conversation/SourceControl/ScmPanel';
import { configureScmStore, resetScmStoreForTest } from '@/renderer/pages/conversation/SourceControl/scmStore';
import {
  applyScmProgress,
  configureScmPublish,
  resetScmPublishForTest,
} from '@/renderer/pages/conversation/SourceControl/publish/scmPublishStore';
import {
  SCM_ERR_COMMIT_HOOK_FAILED,
  SCM_ERR_PUSH_AUTH_FAILED,
} from '@/renderer/pages/conversation/SourceControl/publish/scmPublishModel';
import { RpcError } from '@/renderer/pages/conversation/explorer/monitorClient';

const repo = (
  over: Partial<ScmRepository['capabilities']> = {},
  head: ScmRepository['head'] = { name: 'main' }
): ScmRepository => ({
  repo_id: 'scm:pe1',
  provider_id: 'git',
  root: { pe_id: 'pe1', relative_path: '' },
  label: 'aion',
  head,
  capabilities: { staging: true, local_branches: true, history_graph: false, remote_ops: true, commit: true, ...over },
  state: 'idle',
});

const resource = (path: string, staged: boolean): ScmResource => ({
  file: { pe_id: 'pe1', relative_path: path },
  repo_relative_path: path,
  state: 'modified',
  staged,
});

const calls: Array<{ method: string; params: unknown }> = [];

const install = (opts: {
  repository: ScmRepository;
  resources: ScmResource[];
  head?: ScmStatus['head'];
  remote?: ScmRemoteInfo;
  commit?: () => Promise<unknown>;
  push?: () => Promise<unknown>;
}): void => {
  const st: ScmStatus = {
    repository: { repo_id: opts.repository.repo_id },
    resources: opts.resources,
    seq: 1,
    head: opts.head,
  };
  const port: ScmPort = {
    listRepositories: async () => ({ repositories: [opts.repository] }),
    subscribe: async () => ({ statuses: [st] }),
    unsubscribe: () => {},
    status: async () => st,
    diff: async () => ({ patch: 'p' }),
    act: async (action, params) => {
      calls.push({ method: `scm/${action}`, params });
      return {};
    },
  };
  configureScmStore(port);
  const publish: ScmPublishPort = {
    commit: async (params) => {
      calls.push({ method: 'scm/commit', params });
      return (opts.commit ? await opts.commit() : { commit_sha: '1234567890' }) as never;
    },
    push: async (params) => {
      calls.push({ method: 'scm/push', params });
      return (opts.push ? await opts.push() : { remote: 'origin', branch: 'main', ahead: 0 }) as never;
    },
    remoteInfo: async () =>
      opts.remote ?? {
        remotes: [{ name: 'origin', url_redacted: '/tmp/r.git', provider: 'local' }],
        branch: 'main',
        commit_hooks: [],
      },
  };
  configureScmPublish(publish);
};

const typeMessage = (text: string): void => {
  const box = document.querySelector('[data-scm-commit-message]') as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text } });
};

beforeEach(() => {
  resetScmStoreForTest();
  resetScmPublishForTest();
  confirmCalls.length = 0;
  calls.length = 0;
});

afterEach(() => {
  cleanup();
  resetScmStoreForTest();
  resetScmPublishForTest();
});

describe('graceful degradation', () => {
  it('renders no commit box on a Core without capabilities.commit', async () => {
    const r = repo();
    delete (r.capabilities as { commit?: boolean }).commit;
    install({ repository: r, resources: [resource('a.ts', true)] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');
    expect(document.querySelector('[data-scm-commit-box]')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('keeps the commit box but drops the publish bar without remote_ops', async () => {
    install({ repository: repo({ remote_ops: false }), resources: [resource('a.ts', true)] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');
    expect(document.querySelector('[data-scm-commit-box]')).not.toBeNull();
    expect(document.querySelector('[data-scm-publish-bar]')).toBeNull();
  });
});

describe('commit', () => {
  it('commits staged changes directly', async () => {
    install({ repository: repo(), resources: [resource('a.ts', true), resource('b.ts', false)] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');
    typeMessage('feat: a');
    fireEvent.click(document.querySelector('[data-scm-commit-button]') as HTMLElement);
    await waitFor(() => expect(calls.some((c) => c.method === 'scm/commit')).toBe(true));
    expect(confirmCalls).toHaveLength(0);
    expect(calls.find((c) => c.method === 'scm/commit')?.params).toEqual({
      repository: 'scm:pe1',
      message: 'feat: a',
      amend: false,
    });
    await screen.findByText(/publish\.committed/);
  });

  it('asks before staging everything when nothing is staged', async () => {
    install({ repository: repo(), resources: [resource('b.ts', false)] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('b.ts');
    typeMessage('feat: b');
    fireEvent.click(document.querySelector('[data-scm-commit-button]') as HTMLElement);
    expect(confirmCalls).toHaveLength(1);
    expect(calls).toEqual([]); // nothing happens before the user agrees
    await act(async () => {
      await confirmCalls[0].onOk?.();
    });
    expect(calls.map((c) => c.method)).toEqual(['scm/stage', 'scm/commit']);
  });

  it('shows the hooks notice with --no-verify off by default, and hook output on failure', async () => {
    install({
      repository: repo(),
      resources: [resource('a.ts', true)],
      remote: { remotes: [], branch: 'main', commit_hooks: ['pre-commit'] },
      commit: async () => {
        throw new RpcError({
          code: SCM_ERR_COMMIT_HOOK_FAILED,
          message: 'COMMIT_HOOK_FAILED',
          data: { output: 'eslint: 3 errors' },
        });
      },
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText(/hooksWillRun/);
    const noVerify = document.querySelector('[data-scm-no-verify] input') as HTMLInputElement;
    expect(noVerify.checked).toBe(false);
    typeMessage('feat: a');
    fireEvent.click(document.querySelector('[data-scm-commit-button]') as HTMLElement);
    await screen.findByText('eslint: 3 errors');
    expect(document.querySelector('[data-scm-publish-report="hookFailed"]')).not.toBeNull();
    expect(document.querySelector('[data-scm-publish-retry]')).not.toBeNull();
    expect(calls.find((c) => c.method === 'scm/commit')?.params).not.toHaveProperty('no_verify');
  });
});

describe('push', () => {
  it('confirms origin/<branch> before setting the upstream', async () => {
    install({
      repository: repo(),
      resources: [],
      head: { name: 'feat' },
      remote: {
        remotes: [{ name: 'origin', url_redacted: '/tmp/r.git', provider: 'local' }],
        branch: 'feat',
        commit_hooks: [],
      },
    });
    render(<ScmPanel projectId='p1' />);
    await waitFor(() =>
      expect((document.querySelector('[data-scm-push-button]') as HTMLButtonElement | null)?.disabled).toBe(false)
    );
    fireEvent.click(document.querySelector('[data-scm-push-button]') as HTMLElement);
    expect(confirmCalls).toHaveLength(1);
    expect(String(confirmCalls[0].content)).toContain('"remote":"origin","branch":"feat"');
    expect(calls.filter((c) => c.method === 'scm/push')).toEqual([]);
    await act(async () => {
      await confirmCalls[0].onOk?.();
    });
    expect(calls.find((c) => c.method === 'scm/push')?.params).toEqual({
      repository: 'scm:pe1',
      remote: 'origin',
      set_upstream: true,
    });
  });

  it('pushes a tracked branch without asking, shows progress, then raw failure + retry', async () => {
    let fail: (e: unknown) => void = () => {};
    let attempt = 0;
    install({
      repository: repo(),
      resources: [],
      head: { name: 'main', upstream: 'origin/main', ahead: 2, behind: 0 },
      push: () => {
        attempt += 1;
        if (attempt > 1) return Promise.resolve({ remote: 'origin', branch: 'main', ahead: 0 });
        return new Promise((_, reject) => {
          fail = reject;
        });
      },
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText(/"upstream":"origin\/main","ahead":2/);
    fireEvent.click(document.querySelector('[data-scm-push-button]') as HTMLElement);
    expect(confirmCalls).toHaveLength(0);
    act(() => applyScmProgress({ repository: 'scm:pe1', phase: 'Writing objects', percent: 50 }));
    await screen.findByText('Writing objects');
    await act(async () => {
      fail(
        new RpcError({
          code: SCM_ERR_PUSH_AUTH_FAILED,
          message: 'PUSH_AUTH_FAILED',
          data: { message: 'Authentication failed' },
        })
      );
    });
    await screen.findByText('Authentication failed');
    fireEvent.click(document.querySelector('[data-scm-publish-retry]') as HTMLElement);
    await screen.findByText(/publish\.pushed/);
    expect(calls.filter((c) => c.method === 'scm/push').map((c) => c.params)).toEqual([
      { repository: 'scm:pe1' },
      { repository: 'scm:pe1' },
    ]);
  });
});
