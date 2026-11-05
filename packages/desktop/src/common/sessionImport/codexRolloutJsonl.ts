/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Read-only parser for Codex CLI rollout JSONL
 * (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl).
 */

import type { JournalTranscriptItem } from '@/common/types/journalTranscript';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export type CodexParseResult = {
  cwd?: string;
  sessionId?: string;
  items: JournalTranscriptItem[];
};

function pushItem(
  items: JournalTranscriptItem[],
  sequence: number,
  eventId: string,
  journalKind: string,
  transcriptKind: string,
  summary: string,
  content: string
): number {
  items.push({
    sequence,
    event_id: eventId,
    journal_kind: journalKind,
    transcript_kind: transcriptKind,
    visibility: 'model',
    summary: summary.slice(0, 120),
    content,
    source_sequences: [],
  });
  return sequence;
}

/**
 * Parse Codex rollout JSONL into WorkMate journal-shaped items.
 * Defensive: unknown line types are skipped.
 */
export function parseCodexRolloutJsonl(text: string): CodexParseResult {
  const items: JournalTranscriptItem[] = [];
  let cwd: string | undefined;
  let sessionId: string | undefined;
  let sequence = 0;

  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const trimmed = lines[lineIndex].trim();
    if (!trimmed) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const rec = asRecord(raw);
    if (!rec) continue;

    const type = typeof rec.type === 'string' ? rec.type : '';
    const payload = asRecord(rec.payload) ?? rec;

    if (type === 'session_meta' || type === 'session_meta_event') {
      const meta = asRecord(payload) ?? {};
      if (typeof meta.cwd === 'string' && !cwd) cwd = meta.cwd;
      if (typeof meta.id === 'string' && !sessionId) sessionId = meta.id;
      if (typeof meta.session_id === 'string' && !sessionId) sessionId = meta.session_id;
      continue;
    }

    // Newer Codex: response_item with payload.type message / function_call / …
    if (type === 'response_item') {
      const itemType = typeof payload.type === 'string' ? payload.type : '';
      const eventId =
        typeof payload.id === 'string' ? payload.id : typeof rec.id === 'string' ? rec.id : `codex-${lineIndex}`;

      if (itemType === 'message') {
        const role = typeof payload.role === 'string' ? payload.role : '';
        const content = payload.content;
        let text = '';
        if (typeof content === 'string') text = content;
        else if (Array.isArray(content)) {
          text = content
            .map((block) => {
              const b = asRecord(block);
              if (!b) return '';
              if (typeof b.text === 'string') return b.text;
              if (typeof b.content === 'string') return b.content;
              return '';
            })
            .filter(Boolean)
            .join('\n')
            .trim();
        }
        if (!text) continue;
        sequence += 1;
        if (role === 'user') {
          sequence = pushItem(items, sequence, eventId, 'user_prompt', 'user/message', text, text);
        } else {
          sequence = pushItem(items, sequence, eventId, 'assistant_message', 'assistant/message', text, text);
        }
        continue;
      }

      if (itemType === 'function_call' || itemType === 'custom_tool_call') {
        const name = typeof payload.name === 'string' ? payload.name : 'tool';
        const callId =
          typeof payload.call_id === 'string' ? payload.call_id : typeof payload.id === 'string' ? payload.id : eventId;
        const args = payload.arguments ?? payload.input ?? {};
        sequence += 1;
        sequence = pushItem(
          items,
          sequence,
          callId,
          'tool_call',
          'tool/call',
          name,
          JSON.stringify({ name, input: args })
        );
        continue;
      }

      if (itemType === 'function_call_output' || itemType === 'custom_tool_call_output') {
        const callId =
          typeof payload.call_id === 'string' ? payload.call_id : typeof payload.id === 'string' ? payload.id : eventId;
        const output =
          typeof payload.output === 'string'
            ? payload.output
            : typeof payload.content === 'string'
              ? payload.content
              : JSON.stringify(payload.output ?? payload.content ?? '');
        sequence += 1;
        sequence = pushItem(items, sequence, `${callId}:out`, 'tool_result', 'tool/result', 'tool_result', output);
        continue;
      }
      continue;
    }

    // event_msg with user/agent messages
    if (type === 'event_msg') {
      const msgType = typeof payload.type === 'string' ? payload.type : '';
      if (msgType === 'user_message' || msgType === 'agent_message') {
        const text =
          typeof payload.message === 'string' ? payload.message : typeof payload.text === 'string' ? payload.text : '';
        if (!text.trim()) continue;
        sequence += 1;
        const isUser = msgType === 'user_message';
        sequence = pushItem(
          items,
          sequence,
          `codex-event-${lineIndex}`,
          isUser ? 'user_prompt' : 'assistant_message',
          isUser ? 'user/message' : 'assistant/message',
          text.trim(),
          text.trim()
        );
      }
    }
  }

  return { cwd, sessionId, items };
}
