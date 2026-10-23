/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M7 E4-5 PR dialog: install / login guidance instead of the form, re-check,
 * submit with the TaskRun ids, CLI failure output, and an older Core.
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackendHttpError } from '@/common/adapter/httpBridge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, unknown>) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
  }),
}));

const host = vi.fn();
const createPullRequest = vi.fn();
const list = vi.fn();
vi.mock('@/common', () => ({
  ipcBridge: {
    scmDelivery: {
      host: { invoke: (...args: unknown[]) => host(...args) },
      createPullRequest: { invoke: (...args: unknown[]) => createPullRequest(...args) },
      list: { invoke: (...args: unknown[]) => list(...args) },
    },
  },
}));

const openExternalUrl = vi.fn();
vi.mock('@/renderer/utils/platform', () => ({ openExternalUrl: (url: string) => openExternalUrl(url) }));

import type { ScmRepository } from '@/renderer/pages/conversation/SourceControl/scmModel';
import { CreatePullRequestModal } from '@/renderer/pages/conversation/SourceControl/delivery/CreatePullRequestModal';
import { ScmPullRequestEntry } from '@/renderer/pages/conversation/SourceControl/delivery/ScmPullRequestEntry';

const ready = {
  provider: 'github',
  host: 'github.com',
  remote: 'origin',
  remote_url_redacted: 'https://github.com/o/r.git',
  cli: 'gh',
  installed: true,
  authenticated: true,
};
const repos = [{ repoPath: 'pe:p1', label: 'repo', branch: 'feat/x' }];

const renderModal = (props: Partial<React.ComponentProps<typeof CreatePullRequestModal>> = {}) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CreatePullRequestModal visible repos={repos} onClose={() => {}} {...props} />
    </SWRConfig>
  );

const q = (selector: string) => document.querySelector(selector);

beforeEach(() => {
  host.mockReset();
  createPullRequest.mockReset();
  openExternalUrl.mockReset();
  list.mockReset();
});
afterEach(cleanup);

describe('CreatePullRequestModal', () => {
  it('guides installation, then shows the form after a re-check', async () => {
    host.mockResolvedValueOnce({ ...ready, installed: false, authenticated: false }).mockResolvedValueOnce(ready);
    renderModal();
    await waitFor(() => expect(q('[data-pr-guide="notInstalled"]')).not.toBeNull());
    expect(host).toHaveBeenCalledWith({ repo_path: 'pe:p1' });
    fireEvent.click(screen.getByText('conversation.explorer.scm.delivery.openInstallGuide'));
    expect(openExternalUrl).toHaveBeenCalledWith('https://cli.github.com/');
    expect(q('[data-pr-form]')).toBeNull();
    fireEvent.click(q('[data-pr-recheck]')!);
    await waitFor(() => expect(q('[data-pr-form]')).not.toBeNull());
  });

  it('shows the login command when the CLI is signed out', async () => {
    host.mockResolvedValue({ ...ready, provider: 'gitlab', cli: 'glab', host: 'gitlab.corp', authenticated: false });
    renderModal();
    await waitFor(() => expect(q('[data-pr-guide="notAuthenticated"]')).not.toBeNull());
    expect(q('[data-pr-login-command]')?.textContent).toContain('glab auth login --hostname gitlab.corp');
  });

  it('submits with the TaskRun ids and shows the created link', async () => {
    host.mockResolvedValue(ready);
    createPullRequest.mockResolvedValue({
      pr_url: 'https://github.com/o/r/pull/9',
      pr_number: '9',
      provider: 'github',
      delivery: {},
      evidence_id: 'ev1',
    });
    const onCreated = vi.fn();
    renderModal({ task: { taskSessionId: 'ts1', runId: 'run1' }, onCreated });
    await waitFor(() => expect(q('[data-pr-form]')).not.toBeNull());
    const submit = q('[data-pr-submit]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(q('[data-pr-title]')!, { target: { value: 'Add feature' } });
    fireEvent.change(q('[data-pr-body]')!, { target: { value: 'Body' } });
    await waitFor(() => expect((q('[data-pr-submit]') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(q('[data-pr-submit]')!);
    await waitFor(() => expect(q('[data-pr-created]')).not.toBeNull());
    expect(createPullRequest).toHaveBeenCalledWith({
      repo_path: 'pe:p1',
      branch: 'feat/x',
      base: 'main',
      title: 'Add feature',
      body: 'Body',
      draft: false,
      task_session_id: 'ts1',
      run_id: 'run1',
    });
    expect(onCreated).toHaveBeenCalled();
    expect(screen.getByText('conversation.explorer.scm.delivery.evidenceRecorded')).toBeTruthy();
  });

  it('shows the CLI output when creating fails', async () => {
    host.mockResolvedValue(ready);
    createPullRequest.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/scm-deliveries/pull-request',
        status: 502,
        body: { code: 'PR_CREATE_FAILED', error: 'a pull request for branch "feat/x" already exists' },
      })
    );
    renderModal();
    await waitFor(() => expect(q('[data-pr-form]')).not.toBeNull());
    fireEvent.change(q('[data-pr-title]')!, { target: { value: 'T' } });
    await waitFor(() => expect((q('[data-pr-submit]') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(q('[data-pr-submit]')!);
    await waitFor(() => expect(q('[data-pr-error="createFailed"]')).not.toBeNull());
    expect(q('[data-pr-error="createFailed"]')?.textContent).toContain('already exists');
  });

  it('explains an older Core without the delivery API', async () => {
    host.mockRejectedValue(
      new BackendHttpError({
        method: 'GET',
        path: '/api/scm-deliveries/host',
        status: 404,
        body: { code: 'NOT_FOUND' },
      })
    );
    renderModal();
    await waitFor(() => expect(q('[data-pr-host-error="unsupported"]')).not.toBeNull());
    expect(q('[data-pr-submit]')).toBeNull();
  });
});

describe('ScmPullRequestEntry', () => {
  const scmRepo: ScmRepository = {
    repo_id: 'scm:pe1',
    provider_id: 'git',
    root: { pe_id: 'pe1', relative_path: 'sub' },
    label: 'aion',
    head: { name: 'feat/x' },
    capabilities: { staging: true, local_branches: true, history_graph: false, remote_ops: true, commit: true },
    state: 'idle',
  };
  const renderEntry = (props: Partial<React.ComponentProps<typeof ScmPullRequestEntry>> = {}) =>
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ScmPullRequestEntry repo={scmRepo} status={undefined} upstream='origin/feat/x' detached={false} {...props} />
      </SWRConfig>
    );

  it('opens the dialog for the repository scope once the branch is published', async () => {
    list.mockResolvedValue([]);
    host.mockResolvedValue(ready);
    renderEntry();
    await waitFor(() => expect(q('[data-scm-create-pr]')).not.toBeNull());
    fireEvent.click(q('[data-scm-create-pr]')!);
    await waitFor(() => expect(host).toHaveBeenCalledWith({ repo_path: 'pe:pe1/sub' }));
  });

  it('stays hidden on an older Core and for unpublished branches', async () => {
    list.mockRejectedValue(new BackendHttpError({ method: 'GET', path: '/api/scm-deliveries', status: 404, body: {} }));
    renderEntry();
    await waitFor(() => expect(list).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(q('[data-scm-create-pr]')).toBeNull();
    cleanup();

    list.mockResolvedValue([]);
    renderEntry({ upstream: undefined });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(q('[data-scm-create-pr]')).toBeNull();
  });
});
