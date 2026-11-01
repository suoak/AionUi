import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import {
  buildGithubImportInput,
  githubImportErrorKey,
  isValidGithubRepo,
} from '@/renderer/pages/tasks/githubImportModel';

const httpError = (status: number, error: string) =>
  new BackendHttpError({
    method: 'POST',
    path: '/api/task-sessions/import/github',
    status,
    body: { error, code: 'X' },
  });

describe('GitHub issue import model (M8 E6-7)', () => {
  it('accepts owner/name and github.com URLs, like Core', () => {
    for (const repo of ['acme/widgets', ' Acme/Widgets ', 'https://github.com/acme/widgets.git', 'github.com/a/b/']) {
      expect(isValidGithubRepo(repo), repo).toBe(true);
    }
    for (const repo of ['', 'acme', 'a/b/c', '-a/b', 'a/..', 'a/b c', 'https://gitlab.com/a/b']) {
      expect(isValidGithubRepo(repo), repo).toBe(false);
    }
  });

  it('omits an empty filter', () => {
    expect(buildGithubImportInput(' a/b ', '  ')).toEqual({ repo: 'a/b' });
    expect(buildGithubImportInput('a/b', ' label:bug ')).toEqual({ repo: 'a/b', query: 'label:bug' });
  });

  it('maps Core error codes to localized keys', () => {
    expect(githubImportErrorKey(httpError(422, 'github_cli_missing: install'))).toBe('cliMissing');
    expect(githubImportErrorKey(httpError(422, 'github_not_authenticated: run'))).toBe('notAuthenticated');
    expect(githubImportErrorKey(httpError(404, 'github_repo_not_found: a/b'))).toBe('repoNotFound');
    expect(githubImportErrorKey(httpError(504, 'Request timed out.'))).toBe('timeout');
    expect(githubImportErrorKey(httpError(404, 'Not Found'))).toBe('unsupported');
    expect(githubImportErrorKey(httpError(400, 'limit must be between 1 and 100'))).toBe('invalidInput');
    expect(githubImportErrorKey(httpError(502, 'Upstream service unavailable.'))).toBe('failed');
    expect(githubImportErrorKey(new Error('offline'))).toBe('failed');
  });
});
