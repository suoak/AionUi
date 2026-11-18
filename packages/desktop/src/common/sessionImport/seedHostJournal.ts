/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Seed a desktop-parsed Claude/Codex transcript into the Host journal.
 * Content is opaque text only — never a filesystem path or Host File.
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { ISeedJournalItem } from '@/common/adapter/ipcBridge';
import type { JournalTranscriptItem } from '@/common/types/journalTranscript';

export type SeedHostJournalResult = 'seeded' | 'unsupported' | 'skipped';

export function transcriptItemsToSeedPayload(items: readonly JournalTranscriptItem[]): ISeedJournalItem[] {
  const out: ISeedJournalItem[] = [];
  for (const item of items) {
    if (!item || typeof item.transcript_kind !== 'string') continue;
    const content = (item.content ?? item.summary ?? '').trim();
    if (!content) continue;
    const payload: ISeedJournalItem = {
      transcript_kind: item.transcript_kind,
      content,
    };
    if (item.transcript_kind.startsWith('tool/') && item.event_id?.trim()) {
      payload.call_id = item.event_id.trim();
    }
    out.push(payload);
  }
  return out;
}

export async function seedHostJournal(params: {
  conversation_id: string;
  items: readonly JournalTranscriptItem[];
  source?: string;
  source_session_id?: string;
}): Promise<SeedHostJournalResult> {
  const items = transcriptItemsToSeedPayload(params.items);
  if (!params.conversation_id.trim() || items.length === 0) return 'skipped';
  try {
    await ipcBridge.conversation.seedImportedJournal.invoke({
      conversation_id: params.conversation_id,
      items,
      source: params.source,
      source_session_id: params.source_session_id,
    });
    return 'seeded';
  } catch (error) {
    if (isBackendHttpError(error) && (error.status === 404 || error.status === 405)) {
      return 'unsupported';
    }
    console.warn('[session-import] host journal seed failed', error);
    return 'skipped';
  }
}
