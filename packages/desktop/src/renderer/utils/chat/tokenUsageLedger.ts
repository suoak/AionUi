/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';
import { STORAGE_KEYS } from '@/common/config/storageKeys';

export const USAGE_LEDGER_VERSION = 1;
export const USAGE_LEDGER_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
export const USAGE_LEDGER_MAX_EVENTS = 5_000;

export type UsageEventSource = 'acp' | 'aionrs';

export type UsageEvent = {
  id: string;
  recorded_at: number;
  conversation_id: string;
  fingerprint: string;
  backend: string;
  assistant_id?: string;
  assistant_name?: string;
  conversation_name?: string;
  conversation_source?: string;
  model_id?: string;
  input_tokens: number;
  output_tokens: number;
  thought_tokens: number;
  cached_read_tokens: number;
  cached_write_tokens: number;
  cost_delta: number;
  cost_currency?: string;
  source: UsageEventSource;
};

export type UsageLedger = {
  version: number;
  events: UsageEvent[];
  last_cost_by_conversation: Record<string, { amount: number; currency: string }>;
  last_fingerprint_by_conversation: Record<string, string>;
  /** After an explicit clear, do not re-import last-turn snapshots. */
  backfill_suppressed: boolean;
};

export type UsageLedgerStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type RecordTurnUsageInput = {
  conversation_id: string;
  turn_id?: string;
  backend?: string;
  assistant_id?: string;
  assistant_name?: string;
  conversation_name?: string;
  model_id?: string;
  breakdown?: {
    input_tokens?: number;
    output_tokens?: number;
    thought_tokens?: number;
    cached_read_tokens?: number;
    cached_write_tokens?: number;
  };
  cost?: { amount: number; currency: string };
  source: UsageEventSource;
  recorded_at?: number;
};

const emptyLedger = (): UsageLedger => ({
  version: USAGE_LEDGER_VERSION,
  events: [],
  last_cost_by_conversation: {},
  last_fingerprint_by_conversation: {},
  backfill_suppressed: false,
});

export function createEmptyUsageLedger(): UsageLedger {
  return emptyLedger();
}

const defaultStorage = (): UsageLedgerStorage | null => {
  if (typeof globalThis.localStorage === 'undefined') {
    return null;
  }
  return globalThis.localStorage;
};

const toNonNegativeInt = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.round(value);
};

export function usageEventFingerprint(input: RecordTurnUsageInput): string {
  const turnId = input.turn_id?.trim();
  if (turnId) {
    return `turn:${turnId}`;
  }
  const breakdown = input.breakdown ?? {};
  return [
    'counts',
    toNonNegativeInt(breakdown.input_tokens),
    toNonNegativeInt(breakdown.output_tokens),
    toNonNegativeInt(breakdown.thought_tokens),
    toNonNegativeInt(breakdown.cached_read_tokens),
    toNonNegativeInt(breakdown.cached_write_tokens),
  ].join(':');
}

export function parseUsageLedger(raw: string | null): UsageLedger {
  if (!raw) {
    return emptyLedger();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<UsageLedger>;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.events)) {
      return emptyLedger();
    }
    return {
      version: USAGE_LEDGER_VERSION,
      events: parsed.events.filter(isUsageEvent),
      last_cost_by_conversation:
        parsed.last_cost_by_conversation && typeof parsed.last_cost_by_conversation === 'object'
          ? parsed.last_cost_by_conversation
          : {},
      last_fingerprint_by_conversation:
        parsed.last_fingerprint_by_conversation && typeof parsed.last_fingerprint_by_conversation === 'object'
          ? parsed.last_fingerprint_by_conversation
          : {},
      backfill_suppressed: parsed.backfill_suppressed === true,
    };
  } catch {
    return emptyLedger();
  }
}

const isUsageEvent = (value: unknown): value is UsageEvent => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const event = value as Partial<UsageEvent>;
  return (
    typeof event.id === 'string' &&
    typeof event.recorded_at === 'number' &&
    typeof event.conversation_id === 'string' &&
    typeof event.fingerprint === 'string' &&
    typeof event.backend === 'string' &&
    typeof event.source === 'string'
  );
};

export function pruneUsageLedger(ledger: UsageLedger, now = Date.now()): UsageLedger {
  const cutoff = now - USAGE_LEDGER_RETENTION_MS;
  const kept = ledger.events.filter((event) => event.recorded_at >= cutoff);
  const overflow = Math.max(0, kept.length - USAGE_LEDGER_MAX_EVENTS);
  return {
    ...ledger,
    events: overflow > 0 ? kept.slice(overflow) : kept,
  };
}

export function readUsageLedger(storage: UsageLedgerStorage | null = defaultStorage()): UsageLedger {
  if (!storage) {
    return emptyLedger();
  }
  return pruneUsageLedger(parseUsageLedger(storage.getItem(STORAGE_KEYS.TOKEN_USAGE_LEDGER)));
}

export function writeUsageLedger(ledger: UsageLedger, storage: UsageLedgerStorage | null = defaultStorage()): void {
  if (!storage) {
    return;
  }
  storage.setItem(STORAGE_KEYS.TOKEN_USAGE_LEDGER, JSON.stringify(pruneUsageLedger(ledger)));
}

export function clearUsageLedger(storage: UsageLedgerStorage | null = defaultStorage()): UsageLedger {
  const next = { ...emptyLedger(), backfill_suppressed: true };
  writeUsageLedger(next, storage);
  return next;
}

export function conversationHasUsageEvents(ledger: UsageLedger, conversationId: string): boolean {
  return ledger.events.some((event) => event.conversation_id === conversationId);
}

/**
 * Persist one completed-turn usage report. Mid-turn snapshots without a
 * breakdown are ignored so context-window occupancy is never treated as spend.
 * Duplicate fingerprints for the same conversation are skipped.
 */
export function recordTurnUsage(
  input: RecordTurnUsageInput,
  storage: UsageLedgerStorage | null = defaultStorage()
): UsageEvent | null {
  const conversationId = input.conversation_id.trim();
  if (!conversationId) {
    return null;
  }

  const inputTokens = toNonNegativeInt(input.breakdown?.input_tokens);
  const outputTokens = toNonNegativeInt(input.breakdown?.output_tokens);
  const thoughtTokens = toNonNegativeInt(input.breakdown?.thought_tokens);
  const cachedReadTokens = toNonNegativeInt(input.breakdown?.cached_read_tokens);
  const cachedWriteTokens = toNonNegativeInt(input.breakdown?.cached_write_tokens);
  const hasSpend =
    inputTokens + outputTokens + thoughtTokens > 0 || (typeof input.cost?.amount === 'number' && input.cost.amount > 0);
  if (!hasSpend) {
    return null;
  }

  const ledger = readUsageLedger(storage);
  const fingerprint = usageEventFingerprint(input);
  if (ledger.last_fingerprint_by_conversation[conversationId] === fingerprint) {
    return null;
  }
  if (ledger.events.some((event) => event.conversation_id === conversationId && event.fingerprint === fingerprint)) {
    return null;
  }

  const previousCost = ledger.last_cost_by_conversation[conversationId];
  let costDelta = 0;
  let costCurrency = previousCost?.currency;
  if (input.cost && typeof input.cost.amount === 'number' && Number.isFinite(input.cost.amount)) {
    const previousAmount =
      previousCost && previousCost.currency === (input.cost.currency || previousCost.currency)
        ? previousCost.amount
        : 0;
    costDelta = Math.max(0, input.cost.amount - previousAmount);
    costCurrency = input.cost.currency || previousCost?.currency;
    ledger.last_cost_by_conversation[conversationId] = {
      amount: input.cost.amount,
      currency: costCurrency || 'USD',
    };
  }

  if (inputTokens + outputTokens + thoughtTokens === 0 && costDelta <= 0) {
    writeUsageLedger(ledger, storage);
    return null;
  }

  const event: UsageEvent = {
    id: uuid(12),
    recorded_at: input.recorded_at ?? Date.now(),
    conversation_id: conversationId,
    fingerprint,
    backend: input.backend?.trim() || 'unknown',
    assistant_id: input.assistant_id?.trim() || undefined,
    assistant_name: input.assistant_name?.trim() || undefined,
    conversation_name: input.conversation_name?.trim() || undefined,
    model_id: input.model_id?.trim() || undefined,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    thought_tokens: thoughtTokens,
    cached_read_tokens: cachedReadTokens,
    cached_write_tokens: cachedWriteTokens,
    cost_delta: costDelta,
    cost_currency: costCurrency,
    source: input.source,
  };

  ledger.events.push(event);
  ledger.last_fingerprint_by_conversation[conversationId] = fingerprint;
  writeUsageLedger(ledger, storage);
  return event;
}
