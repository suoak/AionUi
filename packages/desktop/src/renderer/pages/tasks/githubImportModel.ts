/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { ImportGithubIssuesInput } from '@/common/types/agent/taskSession';

/** Last repository imported from; a convenience only. */
export const GITHUB_IMPORT_REPO_KEY = 'tasks.githubImport.repo';

const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** Accepts `owner/name` or a github.com URL; mirrors the Core check. */
export const isValidGithubRepo = (input: string): boolean => {
  let path = input.trim().replace(/^(https?:\/\/)?github\.com\//i, '');
  path = path.replace(/\/+$/, '').replace(/\.git$/, '');
  const parts = path.split('/');
  if (parts.length !== 2) return false;
  const [owner, name] = parts;
  return OWNER.test(owner) && NAME.test(name) && name !== '.' && name !== '..';
};

export const buildGithubImportInput = (repo: string, query: string): ImportGithubIssuesInput => {
  const trimmedQuery = query.trim();
  return trimmedQuery ? { repo: repo.trim(), query: trimmedQuery } : { repo: repo.trim() };
};

export type GithubImportErrorKey =
  | 'cliMissing'
  | 'notAuthenticated'
  | 'repoNotFound'
  | 'timeout'
  | 'invalidInput'
  | 'unsupported'
  | 'failed';

/** Core prefixes gh failures with a stable code (`github_cli_missing: …`). */
export const githubImportErrorKey = (error: unknown): GithubImportErrorKey => {
  if (!isBackendHttpError(error)) return 'failed';
  const message = error.backendMessage ?? '';
  if (message.startsWith('github_cli_missing')) return 'cliMissing';
  if (message.startsWith('github_not_authenticated')) return 'notAuthenticated';
  if (message.startsWith('github_repo_not_found')) return 'repoNotFound';
  // 502 / 504 bodies are generic by design; Core logs the redacted gh output.
  if (error.status === 504) return 'timeout';
  // Older Core without the route.
  if (error.status === 404 || error.status === 405) return 'unsupported';
  if (error.status === 400) return 'invalidInput';
  return 'failed';
};
