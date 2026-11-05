/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

/** Claude Code: ~/.claude/projects/<encoded-cwd>/<uuid>.jsonl */
export function claudeProjectsRoot(homeDir: string): string {
  return path.join(homeDir, '.claude', 'projects');
}

/** Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl (or $CODEX_HOME). */
export function codexSessionsRoot(homeDir: string, codexHomeEnv?: string): string {
  if (codexHomeEnv && codexHomeEnv.trim()) {
    return path.join(codexHomeEnv.trim(), 'sessions');
  }
  return path.join(homeDir, '.codex', 'sessions');
}

/** Session UUID from Claude Code filename. */
export function claudeSessionIdFromPath(filePath: string): string {
  return path.basename(filePath, '.jsonl');
}

/** Best-effort Codex session id from rollout-TIMESTAMP-UUID.jsonl. */
export function codexSessionIdFromPath(filePath: string): string {
  const base = path.basename(filePath, '.jsonl');
  const match = /^rollout-(?:\d{4}-\d{2}-\d{2}T[\d-]+Z?)-(.+)$/i.exec(base);
  return match?.[1] ?? base;
}
