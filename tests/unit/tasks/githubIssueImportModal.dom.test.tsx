import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';

const mocks = vi.hoisted(() => ({ importGithub: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: { taskSession: { board: { importGithub: { invoke: mocks.importGithub } } } },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: 'en-US' },
  }),
}));

import GithubIssueImportModal from '@/renderer/pages/tasks/GithubIssueImportModal';

const typeInto = (testId: string, value: string) => {
  const host = screen.getByTestId(testId);
  const input = (host.tagName === 'INPUT' ? host : host.querySelector('input')) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
};

describe('GithubIssueImportModal (M8 E6-7)', () => {
  beforeEach(() => {
    mocks.importGithub.mockReset();
    window.localStorage.clear();
  });
  afterEach(cleanup);

  it('imports, shows the summary, remembers the repo and notifies the board', async () => {
    mocks.importGithub.mockResolvedValue({ repo: 'acme/widgets', created: 2, updated: 1, unchanged: 3, items: [] });
    const onImported = vi.fn();
    render(<GithubIssueImportModal visible onClose={() => {}} onImported={onImported} />);
    const submit = screen.getByTestId('github-import-submit');
    expect(submit).toBeDisabled();
    typeInto('github-import-repo', 'acme/widgets');
    typeInto('github-import-query', ' label:bug ');
    fireEvent.click(screen.getByTestId('github-import-submit'));
    await waitFor(() => expect(screen.getByTestId('github-import-result')).toBeInTheDocument());
    expect(mocks.importGithub).toHaveBeenCalledWith({ repo: 'acme/widgets', query: 'label:bug' });
    expect(screen.getByTestId('github-import-result').textContent).toContain('"created":2');
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('tasks.githubImport.repo')).toBe('acme/widgets');
  });

  it('keeps an invalid repo from reaching Core and shows gh errors', async () => {
    mocks.importGithub.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/task-sessions/import/github',
        status: 422,
        body: { error: 'github_not_authenticated: run `gh auth login` first', code: 'UNPROCESSABLE_ENTITY' },
      })
    );
    const onImported = vi.fn();
    render(<GithubIssueImportModal visible onClose={() => {}} onImported={onImported} />);
    typeInto('github-import-repo', 'not a repo');
    expect(screen.getByTestId('github-import-submit')).toBeDisabled();
    typeInto('github-import-repo', 'acme/widgets');
    fireEvent.click(screen.getByTestId('github-import-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('github-import-error').getAttribute('data-error')).toBe('notAuthenticated')
    );
    expect(onImported).not.toHaveBeenCalled();
  });
});
