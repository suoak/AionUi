/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * E11: discover + parse Claude Code / Codex sessions (read-only fs).
 * Persists WorkMate JournalTranscript copies under userData for hydrate.
 */

import { app } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  claudeProjectsRoot,
  claudeSessionIdFromPath,
  codexSessionIdFromPath,
  codexSessionsRoot,
  itemsToJournalTranscript,
  parseClaudeCodeJsonl,
  parseCodexRolloutJsonl,
  type ExternalSessionSource,
  type ImportedSessionMeta,
  type ImportedSessionSummary,
} from '@/common/sessionImport';
import type { JournalTranscript } from '@/common/types/journalTranscript';

const MAX_LIST = 200;
const MAX_FILE_BYTES = 32 * 1024 * 1024;

function importedDir(): string {
  return path.join(app.getPath('userData'), 'imported-transcripts');
}

async function safeStat(filePath: string): Promise<{ mtimeMs: number; size: number } | null> {
  try {
    const st = await fs.stat(filePath);
    if (!st.isFile()) return null;
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return null;
  }
}

async function walkClaude(root: string, out: ImportedSessionSummary[]): Promise<void> {
  let projects: string[];
  try {
    projects = await fs.readdir(root);
  } catch {
    return;
  }
  for (const project of projects) {
    const projectDir = path.join(root, project);
    let entries: string[];
    try {
      entries = await fs.readdir(projectDir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.jsonl')) continue;
      // Skip nested sidecar dirs' files (only direct children).
      const filePath = path.join(projectDir, name);
      const st = await safeStat(filePath);
      if (!st) continue;
      const sessionId = claudeSessionIdFromPath(filePath);
      out.push({
        source: 'claude-code',
        path: filePath,
        sessionId,
        label: `${project}/${sessionId.slice(0, 8)}`,
        mtimeMs: st.mtimeMs,
        sizeBytes: st.size,
      });
      if (out.length >= MAX_LIST) return;
    }
  }
}

async function walkCodex(root: string, out: ImportedSessionSummary[]): Promise<void> {
  // YYYY/MM/DD/rollout-*.jsonl — walk three levels
  let years: string[];
  try {
    years = await fs.readdir(root);
  } catch {
    return;
  }
  for (const year of years) {
    const yearDir = path.join(root, year);
    let months: string[];
    try {
      months = await fs.readdir(yearDir);
    } catch {
      continue;
    }
    for (const month of months) {
      const monthDir = path.join(yearDir, month);
      let days: string[];
      try {
        days = await fs.readdir(monthDir);
      } catch {
        continue;
      }
      for (const day of days) {
        const dayDir = path.join(monthDir, day);
        let files: string[];
        try {
          files = await fs.readdir(dayDir);
        } catch {
          continue;
        }
        for (const name of files) {
          if (!name.startsWith('rollout-') || !name.endsWith('.jsonl')) continue;
          const filePath = path.join(dayDir, name);
          const st = await safeStat(filePath);
          if (!st) continue;
          const sessionId = codexSessionIdFromPath(filePath);
          out.push({
            source: 'codex',
            path: filePath,
            sessionId,
            label: `${year}/${month}/${day}/${sessionId.slice(0, 8)}`,
            mtimeMs: st.mtimeMs,
            sizeBytes: st.size,
          });
          if (out.length >= MAX_LIST) return;
        }
      }
    }
  }
}

export async function listExternalSessions(): Promise<ImportedSessionSummary[]> {
  const home = os.homedir();
  const out: ImportedSessionSummary[] = [];
  await walkClaude(claudeProjectsRoot(home), out);
  await walkCodex(codexSessionsRoot(home, process.env.CODEX_HOME), out);
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out.slice(0, MAX_LIST);
}

function parseFile(source: ExternalSessionSource, text: string) {
  return source === 'claude-code' ? parseClaudeCodeJsonl(text) : parseCodexRolloutJsonl(text);
}

export async function previewExternalSession(params: {
  source: ExternalSessionSource;
  path: string;
}): Promise<{ transcript: JournalTranscript; meta: ImportedSessionMeta; itemCount: number }> {
  const st = await safeStat(params.path);
  if (!st) throw new Error('Session file not found');
  if (st.size > MAX_FILE_BYTES) throw new Error('Session file too large to import (>32MB)');

  const text = await fs.readFile(params.path, 'utf8');
  const parsed = parseFile(params.source, text);
  const sessionId =
    parsed.sessionId ||
    (params.source === 'claude-code' ? claudeSessionIdFromPath(params.path) : codexSessionIdFromPath(params.path));
  const conversationId = `import-preview:${sessionId}`;
  const transcript = itemsToJournalTranscript(conversationId, parsed.items, params.source);
  const meta: ImportedSessionMeta = {
    source: params.source,
    source_path: params.path,
    source_session_id: sessionId,
    cwd: parsed.cwd,
    imported_at: Date.now(),
  };
  return { transcript, meta, itemCount: parsed.items.length };
}

export async function bindImportedTranscript(params: {
  conversation_id: string;
  source: ExternalSessionSource;
  path: string;
}): Promise<{ meta: ImportedSessionMeta; itemCount: number; title: string }> {
  const preview = await previewExternalSession({ source: params.source, path: params.path });
  const transcript: JournalTranscript = {
    ...preview.transcript,
    conversation_id: params.conversation_id,
  };
  const dir = importedDir();
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${params.conversation_id}.json`);
  await fs.writeFile(dest, JSON.stringify(transcript), 'utf8');

  const firstUser = transcript.items.find((i) => i.transcript_kind === 'user/message');
  const titleBase = firstUser?.summary?.trim() || preview.meta.source_session_id.slice(0, 8);
  const prefix = params.source === 'claude-code' ? 'Claude' : 'Codex';
  const title = `[Imported ${prefix}] ${titleBase}`.slice(0, 80);

  return { meta: { ...preview.meta, imported_at: Date.now() }, itemCount: preview.itemCount, title };
}

export async function getImportedTranscript(conversationId: string): Promise<JournalTranscript | null> {
  const dest = path.join(importedDir(), `${conversationId}.json`);
  try {
    const text = await fs.readFile(dest, 'utf8');
    return JSON.parse(text) as JournalTranscript;
  } catch {
    return null;
  }
}
