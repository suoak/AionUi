/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * E11: Claude Code / Codex local session import (read-only → WorkMate transcript).
 * Brand: CSBU WorkMate. No AGPL.
 */

export type ExternalSessionSource = 'claude-code' | 'codex';

export type ImportedSessionSummary = {
  source: ExternalSessionSource;
  /** Absolute path to the JSONL file (read-only). */
  path: string;
  sessionId: string;
  /** Best-effort project / cwd label. */
  label: string;
  cwd?: string;
  mtimeMs: number;
  sizeBytes: number;
  /** First user prompt snippet when discoverable without a full parse. */
  preview?: string;
};

export type ImportedSessionMeta = {
  source: ExternalSessionSource;
  source_path: string;
  source_session_id: string;
  cwd?: string;
  imported_at: number;
};
