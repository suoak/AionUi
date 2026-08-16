/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation, TokenUsageData } from '@/common/config/storage';
import {
  conversationHasUsageEvents,
  readUsageLedger,
  recordTurnUsage,
  type RecordTurnUsageInput,
  type UsageLedgerStorage,
} from './tokenUsageLedger';

const getExtraTokenUsage = (conversation: TChatConversation): TokenUsageData | undefined => {
  const extra = conversation.extra as { last_token_usage?: TokenUsageData } | undefined;
  return extra?.last_token_usage;
};

export function conversationModelId(conversation: TChatConversation): string | undefined {
  if (conversation.type === 'acp' || conversation.type === 'antigravity') {
    return conversation.extra.current_model_id?.trim() || undefined;
  }
  if (conversation.type === 'aionrs') {
    return conversation.model?.use_model?.trim() || conversation.model?.id?.trim() || undefined;
  }
  return undefined;
}

const getConversationBackend = (conversation: TChatConversation): string | undefined => {
  if (conversation.assistant?.backend) {
    return conversation.assistant.backend;
  }
  if (conversation.type === 'acp' || conversation.type === 'antigravity') {
    return conversation.extra.backend;
  }
  if (conversation.type === 'aionrs') {
    return 'aionrs';
  }
  return conversation.type;
};

/**
 * Convert a persisted conversation snapshot into a ledger event.
 * ACP `total_tokens` is context occupancy, so occupancy-only rows are skipped
 * unless the agent also reported a per-turn breakdown or session cost.
 */
export function usageInputFromConversation(conversation: TChatConversation): RecordTurnUsageInput | null {
  const usage = getExtraTokenUsage(conversation);
  if (!usage) {
    return null;
  }

  const breakdown = usage.breakdown;
  const inputTokens = breakdown?.input_tokens ?? 0;
  const outputTokens = breakdown?.output_tokens ?? 0;
  const thoughtTokens = breakdown?.thought_tokens ?? 0;
  const hasBreakdown =
    (typeof inputTokens === 'number' && inputTokens > 0) ||
    (typeof outputTokens === 'number' && outputTokens > 0) ||
    (typeof thoughtTokens === 'number' && thoughtTokens > 0);
  const hasCost = typeof usage.cost?.amount === 'number' && usage.cost.amount > 0;
  const isAionrsSpend = conversation.type === 'aionrs' && usage.total_tokens > 0;

  if (!hasBreakdown && !hasCost && !isAionrsSpend) {
    return null;
  }

  return {
    conversation_id: conversation.id,
    turn_id: `backfill:${conversation.id}`,
    backend: getConversationBackend(conversation),
    assistant_id: conversation.assistant?.id,
    assistant_name: conversation.assistant?.name,
    conversation_name: conversation.name,
    model_id: conversationModelId(conversation),
    breakdown: hasBreakdown
      ? breakdown
      : isAionrsSpend
        ? { input_tokens: usage.total_tokens }
        : undefined,
    cost: usage.cost,
    source: conversation.type === 'aionrs' ? 'aionrs' : 'acp',
    recorded_at: conversation.modified_at || conversation.created_at,
  };
}

export function backfillUsageFromConversations(
  conversations: TChatConversation[],
  storage?: UsageLedgerStorage | null
): number {
  const ledger = readUsageLedger(storage);
  if (ledger.backfill_suppressed) {
    return 0;
  }

  let recorded = 0;
  for (const conversation of conversations) {
    if (conversationHasUsageEvents(ledger, conversation.id)) {
      continue;
    }
    const input = usageInputFromConversation(conversation);
    if (!input) {
      continue;
    }
    const event = recordTurnUsage(input, storage);
    if (event) {
      ledger.events.push(event);
      recorded += 1;
    }
  }
  return recorded;
}
