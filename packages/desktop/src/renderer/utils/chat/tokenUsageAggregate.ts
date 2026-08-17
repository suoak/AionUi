/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UsageEvent } from './tokenUsageLedger';

export type UsageRange = '7d' | '30d' | '90d' | 'all';

export type UsageTotals = {
  input_tokens: number;
  output_tokens: number;
  thought_tokens: number;
  cached_read_tokens: number;
  cached_write_tokens: number;
  total_tokens: number;
  cost_amount: number;
  cost_currency?: string;
  turn_count: number;
  conversation_count: number;
};

export type UsageDailyPoint = {
  date: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_amount: number;
};

export type UsageBreakdownRow = {
  key: string;
  label: string;
  total_tokens: number;
  turn_count: number;
  cost_amount: number;
};

export const USAGE_RANGE_DAYS: Record<Exclude<UsageRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/**
 * Prompt tokens that count as spend.
 *
 * Codex `last.inputTokens` and Grok `inputTokens` are the full prompt and
 * already include cache hits. Claude reports base input separately, with
 * cache in its own bucket (so `input < cached_read` on a cache-heavy turn).
 * Subtract only the inclusive shape.
 */
export function usageEventSpendInput(
  event: Pick<UsageEvent, 'input_tokens' | 'cached_read_tokens'>
): number {
  const input = event.input_tokens;
  const cached = event.cached_read_tokens;
  if (cached > 0 && input >= cached) {
    return input - cached;
  }
  return input;
}

export function usageEventTotalTokens(
  event: Pick<UsageEvent, 'input_tokens' | 'output_tokens' | 'thought_tokens' | 'cached_read_tokens'>
): number {
  return usageEventSpendInput(event) + event.output_tokens + event.thought_tokens;
}

export const DEFAULT_USAGE_CHANNEL = 'workmate';

const WORKMATE_CHANNEL_ALIASES = new Set(['aionui', 'workmate']);

export function normalizeUsageChannelKey(source?: string): string {
  const key = source?.trim();
  if (!key || WORKMATE_CHANNEL_ALIASES.has(key)) {
    return DEFAULT_USAGE_CHANNEL;
  }
  return key;
}

export function resolveUsageChannelLabel(
  source: string | undefined,
  labels: Record<string, string>,
  unknownLabel: string
): string {
  const key = normalizeUsageChannelKey(source);
  if (key === 'unknown') {
    return unknownLabel;
  }
  return labels[key] || key;
}

export function usageRangeStart(range: UsageRange, now = Date.now()): number | null {
  if (range === 'all') {
    return null;
  }
  return now - USAGE_RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
}

export function filterUsageEvents(events: UsageEvent[], range: UsageRange, now = Date.now()): UsageEvent[] {
  const start = usageRangeStart(range, now);
  if (start === null) {
    return [...events].toSorted((left, right) => left.recorded_at - right.recorded_at);
  }
  return events
    .filter((event) => event.recorded_at >= start)
    .toSorted((left, right) => left.recorded_at - right.recorded_at);
}

export function summarizeUsageEvents(events: UsageEvent[]): UsageTotals {
  const conversationIds = new Set<string>();
  const totals = events.reduce<UsageTotals>(
    (acc, event) => {
      conversationIds.add(event.conversation_id);
      acc.input_tokens += usageEventSpendInput(event);
      acc.output_tokens += event.output_tokens;
      acc.thought_tokens += event.thought_tokens;
      acc.cached_read_tokens += event.cached_read_tokens;
      acc.cached_write_tokens += event.cached_write_tokens;
      acc.total_tokens += usageEventTotalTokens(event);
      acc.cost_amount += event.cost_delta;
      acc.turn_count += 1;
      if (event.cost_currency && !acc.cost_currency) {
        acc.cost_currency = event.cost_currency;
      }
      return acc;
    },
    {
      input_tokens: 0,
      output_tokens: 0,
      thought_tokens: 0,
      cached_read_tokens: 0,
      cached_write_tokens: 0,
      total_tokens: 0,
      cost_amount: 0,
      turn_count: 0,
      conversation_count: 0,
    }
  );
  totals.conversation_count = conversationIds.size;
  return totals;
}

const toDateKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfLocalDay = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export function filterUsageEventsByModel(events: UsageEvent[], modelKey: string): UsageEvent[] {
  if (modelKey === 'all') {
    return events;
  }
  if (modelKey === 'unknown') {
    return events.filter((event) => !event.model_id?.trim());
  }
  return events.filter((event) => event.model_id === modelKey);
}

/** Keep the selected model only while it still appears in the current range. */
export function resolveUsageModelFilter(modelKey: string, availableKeys: readonly string[]): string {
  if (modelKey === 'all' || availableKeys.includes(modelKey)) {
    return modelKey;
  }
  return 'all';
}

export function filterUsageToday(events: UsageEvent[], now = Date.now()): UsageEvent[] {
  const start = startOfLocalDay(now);
  return events.filter((event) => event.recorded_at >= start);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveUsageTrendDays(events: UsageEvent[], range: UsageRange, now = Date.now()): number {
  if (range !== 'all') {
    return USAGE_RANGE_DAYS[range];
  }
  if (events.length === 0) {
    return USAGE_RANGE_DAYS['7d'];
  }
  const earliest = Math.min(...events.map((event) => event.recorded_at));
  const spannedDays = Math.floor((startOfLocalDay(now) - startOfLocalDay(earliest)) / DAY_MS) + 1;
  return Math.min(USAGE_RANGE_DAYS['90d'], Math.max(USAGE_RANGE_DAYS['7d'], spannedDays));
}

export function buildUsageDailySeries(events: UsageEvent[], range: UsageRange, now = Date.now()): UsageDailyPoint[] {
  const dayCount = resolveUsageTrendDays(events, range, now);
  const lastDay = startOfLocalDay(now);
  const points = new Map<string, UsageDailyPoint>();

  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const date = toDateKey(lastDay - offset * DAY_MS);
    points.set(date, { date, input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_amount: 0 });
  }

  for (const event of events) {
    const date = toDateKey(event.recorded_at);
    const point = points.get(date);
    if (!point) {
      continue;
    }
    point.input_tokens += usageEventSpendInput(event);
    point.output_tokens += event.output_tokens;
    point.total_tokens += usageEventTotalTokens(event);
    point.cost_amount += event.cost_delta;
  }

  return [...points.values()];
}

const addBreakdownRow = (rows: Map<string, UsageBreakdownRow>, key: string, label: string, event: UsageEvent): void => {
  const existing = rows.get(key);
  if (existing) {
    existing.total_tokens += usageEventTotalTokens(event);
    existing.turn_count += 1;
    existing.cost_amount += event.cost_delta;
    return;
  }
  rows.set(key, {
    key,
    label,
    total_tokens: usageEventTotalTokens(event),
    turn_count: 1,
    cost_amount: event.cost_delta,
  });
};

const sortBreakdown = (rows: Map<string, UsageBreakdownRow>): UsageBreakdownRow[] =>
  [...rows.values()].toSorted(
    (left, right) => right.total_tokens - left.total_tokens || right.turn_count - left.turn_count
  );

export function breakdownUsageByAgent(events: UsageEvent[], unknownLabel: string): UsageBreakdownRow[] {
  const rows = new Map<string, UsageBreakdownRow>();
  for (const event of events) {
    const key = event.backend.trim() || 'unknown';
    addBreakdownRow(rows, key, key === 'unknown' ? unknownLabel : event.backend, event);
  }
  return sortBreakdown(rows);
}

export function breakdownUsageByAssistant(events: UsageEvent[], unknownLabel: string): UsageBreakdownRow[] {
  const rows = new Map<string, UsageBreakdownRow>();
  for (const event of events) {
    const key = event.assistant_id?.trim() || event.assistant_name?.trim() || 'unknown';
    const label = event.assistant_name?.trim() || unknownLabel;
    addBreakdownRow(rows, key, key === 'unknown' ? unknownLabel : label, event);
  }
  return sortBreakdown(rows);
}

export function breakdownUsageByChannel(
  events: UsageEvent[],
  unknownLabel: string,
  channelLabels: Record<string, string> = {}
): UsageBreakdownRow[] {
  const rows = new Map<string, UsageBreakdownRow>();
  for (const event of events) {
    const key = normalizeUsageChannelKey(event.conversation_source);
    addBreakdownRow(rows, key, resolveUsageChannelLabel(key, channelLabels, unknownLabel), event);
  }
  return sortBreakdown(rows);
}

export function breakdownUsageByModel(events: UsageEvent[], unknownLabel: string): UsageBreakdownRow[] {
  const rows = new Map<string, UsageBreakdownRow>();
  for (const event of events) {
    const key = event.model_id?.trim() || 'unknown';
    addBreakdownRow(rows, key, key === 'unknown' ? unknownLabel : key, event);
  }
  return sortBreakdown(rows);
}

export type UsageConversationRow = {
  conversation_id: string;
  label: string;
  backend: string;
  total_tokens: number;
  turn_count: number;
  last_recorded_at: number;
};

export function breakdownUsageByConversation(events: UsageEvent[], unnamedLabel: string): UsageConversationRow[] {
  const rows = new Map<string, UsageConversationRow>();
  for (const event of events) {
    const existing = rows.get(event.conversation_id);
    if (existing) {
      existing.total_tokens += usageEventTotalTokens(event);
      existing.turn_count += 1;
      existing.last_recorded_at = Math.max(existing.last_recorded_at, event.recorded_at);
      if (event.conversation_name?.trim()) {
        existing.label = event.conversation_name.trim();
      }
      continue;
    }
    rows.set(event.conversation_id, {
      conversation_id: event.conversation_id,
      label: event.conversation_name?.trim() || unnamedLabel,
      backend: event.backend,
      total_tokens: usageEventTotalTokens(event),
      turn_count: 1,
      last_recorded_at: event.recorded_at,
    });
  }
  return [...rows.values()].toSorted((left, right) => right.last_recorded_at - left.last_recorded_at);
}

export function conversationSpendTokens(events: UsageEvent[], conversationId: string): number {
  return events
    .filter((event) => event.conversation_id === conversationId)
    .reduce((sum, event) => sum + usageEventTotalTokens(event), 0);
}

const csvEscape = (value: string | undefined): string => {
  const text = value ?? '';
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
};

export function usageEventsToCsv(events: UsageEvent[]): string {
  const header = [
    'recorded_at',
    'conversation_id',
    'conversation_name',
    'backend',
    'assistant_name',
    'model_id',
    'input_tokens',
    'output_tokens',
    'thought_tokens',
    'cost_delta',
    'cost_currency',
    'source',
  ];
  const rows = events.map((event) =>
    [
      new Date(event.recorded_at).toISOString(),
      csvEscape(event.conversation_id),
      csvEscape(event.conversation_name),
      csvEscape(event.backend),
      csvEscape(event.assistant_name),
      csvEscape(event.model_id),
      event.input_tokens,
      event.output_tokens,
      event.thought_tokens,
      event.cost_delta,
      csvEscape(event.cost_currency),
      event.source,
    ].join(',')
  );
  return [header.join(','), ...rows].join('\n');
}
