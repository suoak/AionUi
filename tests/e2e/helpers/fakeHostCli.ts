/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A fake `gh` for delivery E2E (M7 E4-6). Core runs `gh` from the PATH it
 * inherits, and the app rebuilds PATH from the login shell at startup, so pass
 * `binDir` as `CSBU_WORKMATE_E2E_PATH_PREPEND` (honoured only under
 * `CSBU_WORKMATE_E2E_TEST=1`). Specs should assert the fake saw a call before
 * driving anything, so a real `gh` is never reached.
 * - `gh pr create` while signed out fails with gh's own "gh auth login" hint
 *
 * - `gh auth status --hostname <h>` exits 0, or 1 when `authenticated: false`
 * - `gh pr create ... --body-file -` reads the body from stdin and prints a PR URL
 * Every call is appended to `logFile` as one JSON line {argv, stdin, cwd}.
 *
 * POSIX only: Rust's `Command::new("gh")` does not resolve `.cmd` shims on
 * Windows, so the Windows leg needs a compiled stub (left to the CI matrix work).
 */

import fs from 'node:fs';
import path from 'node:path';

export type FakeHostCli = {
  binDir: string;
  logFile: string;
  prUrl: string;
  calls: () => Array<{ argv: string[]; stdin: string; cwd: string }>;
};

const SCRIPT = (logFile: string, stateFile: string, prUrl: string) => `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const argv = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)}, 'utf8'));
const record = (stdin) =>
  fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ argv, stdin, cwd: process.cwd() }) + '\\n');
if (argv[0] === 'auth' && argv[1] === 'status') {
  record('');
  if (state.authenticated) {
    process.stdout.write('Logged in to ' + (argv[3] || 'github.com') + ' account e2e\\n');
    process.exit(0);
  }
  process.stderr.write('You are not logged into any GitHub hosts. To log in, run: gh auth login\\n');
  process.exit(1);
}
if (argv[0] === 'pr' && argv[1] === 'create') {
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', () => {
    record(Buffer.concat(chunks).toString('utf8'));
    if (!state.authenticated) {
      process.stderr.write('To get started with GitHub CLI, please run:  gh auth login\\n');
      process.exit(4);
    }
    process.stdout.write('Creating pull request\\n' + ${JSON.stringify(prUrl)} + '\\n');
    process.exit(0);
  });
  return;
}
record('');
process.stderr.write('fake gh: unsupported ' + argv.join(' ') + '\\n');
process.exit(2);
`;

export function createFakeHostCli(
  root: string,
  options: { authenticated?: boolean; prUrl?: string } = {}
): FakeHostCli & { setAuthenticated: (value: boolean) => void } {
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const logFile = path.join(root, 'gh-calls.jsonl');
  const stateFile = path.join(root, 'gh-state.json');
  const prUrl = options.prUrl ?? 'https://github.com/e2e/demo/pull/1';
  const setAuthenticated = (value: boolean) => fs.writeFileSync(stateFile, JSON.stringify({ authenticated: value }));
  setAuthenticated(options.authenticated ?? true);
  fs.writeFileSync(logFile, '');
  const ghPath = path.join(binDir, 'gh');
  fs.writeFileSync(ghPath, SCRIPT(logFile, stateFile, prUrl));
  fs.chmodSync(ghPath, 0o755);
  return {
    binDir,
    logFile,
    prUrl,
    setAuthenticated,
    calls: () =>
      fs
        .readFileSync(logFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { argv: string[]; stdin: string; cwd: string }),
  };
}

/** PATH with `binDir` first, for the app launch env. */
export const pathWith = (binDir: string, base = process.env.PATH ?? ''): string =>
  [binDir, base].filter(Boolean).join(path.delimiter);
