/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { resolveAssistantName } from '@/renderer/utils/model/assistantDisplay';

/** One row of the `@` menu's Assistants group (3.0 U7). */
export type AssistantMentionItem = {
  id: string;
  name: string;
  description?: string;
};

export const ASSISTANT_MENTION_LIMIT = 3;

/**
 * Assistants whose name matches the `@` query (prefix first, then substring).
 * An empty query shows the first few. Disabled assistants and `excludeId`
 * (this conversation's own assistant) are left out.
 */
export const filterAssistantMentions = (
  assistants: readonly Assistant[],
  query: string,
  localeKey: string,
  options: { excludeId?: string; limit?: number } = {}
): AssistantMentionItem[] => {
  const q = query.trim().toLowerCase();
  const limit = options.limit ?? ASSISTANT_MENTION_LIMIT;
  const rows = assistants
    .filter((a) => a.enabled !== false && a.id !== options.excludeId)
    .map(
      (a): AssistantMentionItem => ({
        id: a.id,
        name: resolveAssistantName(a, localeKey, a.id),
        description: a.description ?? undefined,
      })
    );
  if (!q) return rows.slice(0, limit);
  const scored = rows
    .map((row) => {
      const name = row.name.toLowerCase();
      const at = name.indexOf(q);
      if (at < 0) return null;
      return { row, score: at === 0 ? 0 : 1 };
    })
    .filter((x): x is { row: AssistantMentionItem; score: number } => x !== null)
    .toSorted((a, b) => a.score - b.score || a.row.name.localeCompare(b.row.name));
  return scored.slice(0, limit).map((x) => x.row);
};

/** Text inserted for a picked assistant (the insertion adds the trailing space). */
export const assistantMentionText = (item: Pick<AssistantMentionItem, 'name'>): string => `@${item.name}`;
