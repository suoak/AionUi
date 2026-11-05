/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Read-only parser for Claude Code session JSONL
 * (~/.claude/projects/<encoded>/<uuid>.jsonl).
 */

import type { JournalTranscriptItem } from '@/common/types/journalTranscript';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    const rec = asRecord(block);
    if (!rec) continue;
    if (rec.type === 'text' && typeof rec.text === 'string') {
      parts.push(rec.text);
    } else if (rec.type === 'tool_result') {
      const inner = rec.content;
      if (typeof inner === 'string') parts.push(inner);
      else if (Array.isArray(inner)) {
        for (const sub of inner) {
          const s = asRecord(sub);
          if (s && typeof s.text === 'string') parts.push(s.text);
        }
      }
    }
  }
  return parts.join('\n').trim();
}

function toolUses(content: unknown): Array<{ id: string; name: string; input: unknown }> {
  if (!Array.isArray(content)) return [];
  const out: Array<{ id: string; name: string; input: unknown }> = [];
  for (const block of content) {
    const rec = asRecord(block);
    if (!rec || rec.type !== 'tool_use') continue;
    if (typeof rec.id !== 'string' || typeof rec.name !== 'string') continue;
    out.push({ id: rec.id, name: rec.name, input: rec.input });
  }
  return out;
}

export type ClaudeParseResult = {
  cwd?: string;
  sessionId?: string;
  items: JournalTranscriptItem[];
};

/**
 * Parse Claude Code JSONL into WorkMate journal-shaped items (model-visible only).
 * Skips sidechains, meta, file-history, and non-conversational types.
 */
export function parseClaudeCodeJsonl(text: string): ClaudeParseResult {
  const items: JournalTranscriptItem[] = [];
  let cwd: string | undefined;
  let sessionId: string | undefined;
  let sequence = 0;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const rec = asRecord(raw);
    if (!rec) continue;

    if (typeof rec.cwd === 'string' && !cwd) cwd = rec.cwd;
    if (typeof rec.sessionId === 'string' && !sessionId) sessionId = rec.sessionId;
    if (rec.isSidechain === true) continue;

    const type = rec.type;
    if (type !== 'user' && type !== 'assistant') continue;

    const message = asRecord(rec.message) ?? {};
    const content = message.content;
    const eventId = typeof rec.uuid === 'string' ? rec.uuid : `claude-${sequence}`;

    if (type === 'user') {
      // Skip pure tool_result-only user lines for the model surface; still
      // emit a host-visible tool result when we can pair later — for v1 we
      // only keep plain user prompts (string content).
      if (typeof content === 'string' && content.trim()) {
        sequence += 1;
        items.push({
          sequence,
          event_id: eventId,
          journal_kind: 'user_prompt',
          transcript_kind: 'user/message',
          visibility: 'model',
          summary: content.trim().slice(0, 120),
          content: content.trim(),
          source_sequences: [],
        });
      } else if (Array.isArray(content)) {
        const text = contentToText(content);
        const hasToolResult = content.some((b) => asRecord(b)?.type === 'tool_result');
        if (hasToolResult) {
          sequence += 1;
          items.push({
            sequence,
            event_id: eventId,
            journal_kind: 'tool_result',
            transcript_kind: 'tool/result',
            visibility: 'model',
            summary: 'tool_result',
            content: text || '(tool result)',
            source_sequences: [],
          });
        } else if (text) {
          sequence += 1;
          items.push({
            sequence,
            event_id: eventId,
            journal_kind: 'user_prompt',
            transcript_kind: 'user/message',
            visibility: 'model',
            summary: text.slice(0, 120),
            content: text,
            source_sequences: [],
          });
        }
      }
      continue;
    }

    // assistant
    const text = contentToText(content);
    const tools = toolUses(content);
    if (text) {
      sequence += 1;
      items.push({
        sequence,
        event_id: `${eventId}:text`,
        journal_kind: 'assistant_message',
        transcript_kind: 'assistant/message',
        visibility: 'model',
        summary: text.slice(0, 120),
        content: text,
        source_sequences: [],
      });
    }
    for (const tool of tools) {
      sequence += 1;
      items.push({
        sequence,
        event_id: tool.id,
        journal_kind: 'tool_call',
        transcript_kind: 'tool/call',
        visibility: 'model',
        summary: tool.name,
        content: JSON.stringify({ name: tool.name, input: tool.input }),
        source_sequences: [],
      });
    }
  }

  return { cwd, sessionId, items };
}
