/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createEmptyJournalTranscript,
  type JournalTranscript,
  type JournalTranscriptItem,
} from '@/common/types/journalTranscript';

import type { ExternalSessionSource } from './types';

export function itemsToJournalTranscript(
  conversationId: string,
  items: JournalTranscriptItem[],
  source: ExternalSessionSource
): JournalTranscript {
  const base = createEmptyJournalTranscript(conversationId);
  const modelItems = items.filter((item) => item.visibility === 'model');
  return {
    ...base,
    conversation_id: conversationId,
    visibility: 'model',
    items: modelItems,
    model_visible_count: modelItems.length,
    // Placeholders — import is read-only reconstruction, not Host-authored.
    model_visible_sha256: `import:${source}`,
    journal_sha256: `import:${source}`,
    model_surface_reconstructible: true,
    tool_pairing_balanced: true,
  };
}
