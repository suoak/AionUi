/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A work tree whose `origin` looks like GitHub but pushes to a local bare repo
 * (M7 E4-6). `git remote get-url origin` (what Core reads to pick the provider)
 * returns the GitHub URL; `git push` uses `pushurl`, the bare repo.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type GitRemoteFixture = { workDir: string; bareDir: string; remoteUrl: string };

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' },
  }).trim();

export function createGitRemoteFixture(
  root: string,
  remoteUrl = 'https://github.com/e2e/demo.git'
): GitRemoteFixture & { git: (...args: string[]) => string } {
  const workDir = path.join(root, 'work');
  const bareDir = path.join(root, 'remote.git');
  fs.mkdirSync(workDir, { recursive: true });
  git(root, 'init', '--bare', '-q', '-b', 'main', bareDir);
  git(workDir, 'init', '-q', '-b', 'main');
  git(workDir, 'config', 'user.name', 'E2E');
  git(workDir, 'config', 'user.email', 'e2e@example.invalid');
  git(workDir, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(workDir, 'README.md'), '# demo\n');
  git(workDir, 'add', 'README.md');
  git(workDir, 'commit', '-q', '-m', 'init');
  git(workDir, 'remote', 'add', 'origin', remoteUrl);
  git(workDir, 'remote', 'set-url', '--push', 'origin', bareDir);
  git(workDir, 'push', '-q', 'origin', 'main');
  return { workDir, bareDir, remoteUrl, git: (...args) => git(workDir, ...args) };
}

/** Branch tip in the bare remote, or '' when the branch was never pushed. */
export const remoteBranchSha = (bareDir: string, branch: string): string => {
  try {
    return git(bareDir, 'rev-parse', '--verify', '-q', `refs/heads/${branch}`);
  } catch {
    return '';
  }
};
