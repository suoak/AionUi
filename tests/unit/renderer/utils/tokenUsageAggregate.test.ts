/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  breakdownUsageByAgent,
  breakdownUsageByAssistant,
  breakdownUsageByConversation,
  breakdownUsageByChannel,
  breakdownUsageByModel,
  buildUsageDailySeries,
  conversationSpendTokens,
  resolveUsageChannelLabel,
  usageEventSpendInput,
  filterUsageEvents,
  filterUsageEventsByModel,
  filterUsageToday,
  reconcileUsageEvents,
  resolveUsageModelFilter,
  resolveUsageTrendDays,
  summarizeUsageEvents,
  usageEventsToCsv,
} from '@/renderer/utils/chat/tokenUsageAggregate';
import type { UsageEvent } from '@/renderer/utils/chat/tokenUsageLedger';

const event = (overrides: Partial<UsageEvent>): UsageEvent => ({
  id: overrides.id || 'e',
  recorded_at: overrides.recorded_at ?? Date.now(),
  conversation_id: overrides.conversation_id || 'conv-1',
  fingerprint: overrides.fingerprint || 'fp',
  backend: overrides.backend || 'claude',
  assistant_id: overrides.assistant_id,
  assistant_name: overrides.assistant_name,
  conversation_name: overrides.conversation_name,
  conversation_source: overrides.conversation_source,
  model_id: overrides.model_id,
  turn_id: overrides.turn_id,
  total_tokens: overrides.total_tokens,
  input_tokens: overrides.input_tokens ?? 0,
  output_tokens: overrides.output_tokens ?? 0,
  thought_tokens: overrides.thought_tokens ?? 0,
  cached_read_tokens: overrides.cached_read_tokens ?? 0,
  cached_write_tokens: overrides.cached_write_tokens ?? 0,
  cost_delta: overrides.cost_delta ?? 0,
  cost_currency: overrides.cost_currency,
  source: overrides.source || 'acp',
});

describe('tokenUsageAggregate', () => {
  it('filters events outside the selected range', () => {
    const now = Date.parse('2026-08-16T12:00:00');
    const events = [
      event({ id: 'old', recorded_at: now - 40 * 24 * 60 * 60 * 1000, input_tokens: 100 }),
      event({ id: 'recent', recorded_at: now - 2 * 24 * 60 * 60 * 1000, input_tokens: 20 }),
    ];

    const visible = filterUsageEvents(events, '7d', now);
    expect(visible.map((item) => item.id)).toEqual(['recent']);
    expect(filterUsageToday(events, now).map((item) => item.id)).toEqual([]);
    expect(
      filterUsageToday([event({ id: 'today', recorded_at: now, input_tokens: 3 })], now).map((item) => item.id)
    ).toEqual(['today']);
  });

  it('uses whole local calendar days so range totals match the trend dates', () => {
    const now = Date.parse('2026-08-16T18:00:00');
    const events = [
      event({ id: 'first-visible', recorded_at: Date.parse('2026-08-10T00:00:00'), input_tokens: 3 }),
      event({ id: 'previous', recorded_at: Date.parse('2026-08-09T23:59:59'), input_tokens: 7 }),
    ];

    expect(filterUsageEvents(events, '7d', now).map((item) => item.id)).toEqual(['first-visible']);
    expect(buildUsageDailySeries(filterUsageEvents(events, '7d', now), '7d', now)[0]).toMatchObject({
      date: '2026-08-10',
      total_tokens: 3,
    });
  });

  it('reconciles matching backend and local rows one-for-one without dropping identical real turns', () => {
    const backend = [event({ id: 'backend-1', fingerprint: 'turn:first', turn_id: 'first' })];
    const local = [
      event({ id: 'local-copy', fingerprint: 'turn:first', turn_id: 'first' }),
      event({ id: 'local-second-turn', fingerprint: 'turn:second', turn_id: 'second' }),
    ];

    expect(reconcileUsageEvents(backend, local).map((item) => item.id)).toEqual(['backend-1', 'local-second-turn']);
  });

  it('uses stable turn identity and enriches backend rows with local display metadata', () => {
    const backend = event({
      id: 'backend',
      fingerprint: 'turn:shared',
      turn_id: 'shared',
      backend: 'claude',
      model_id: undefined,
    });
    const local = event({
      id: 'local',
      fingerprint: 'turn:shared',
      turn_id: 'shared',
      backend: 'different-client-label',
      model_id: 'claude-sonnet',
      assistant_name: 'Research assistant',
    });

    expect(reconcileUsageEvents([backend], [local])).toEqual([
      expect.objectContaining({
        id: 'backend',
        backend: 'claude',
        model_id: 'claude-sonnet',
        assistant_name: 'Research assistant',
      }),
    ]);
  });

  it('summarizes tokens, turns, conversations, and cost', () => {
    const totals = summarizeUsageEvents([
      event({
        conversation_id: 'a',
        input_tokens: 10,
        output_tokens: 4,
        thought_tokens: 2,
        cost_delta: 0.1,
        cost_currency: 'USD',
      }),
      event({ conversation_id: 'b', input_tokens: 6, output_tokens: 3, cost_delta: 0.05, cost_currency: 'USD' }),
    ]);

    expect(totals.total_tokens).toBe(23);
    expect(totals.turn_count).toBe(2);
    expect(totals.conversation_count).toBe(2);
    expect(totals.cost_amount).toBeCloseTo(0.15);
    expect(totals.cost_currency).toBe('USD');
    expect(totals.cost_by_currency).toEqual({ USD: 0.15000000000000002 });
  });

  it('keeps reported costs separated by currency', () => {
    const totals = summarizeUsageEvents([
      event({ cost_delta: 1.25, cost_currency: 'usd' }),
      event({ cost_delta: 8, cost_currency: 'CNY' }),
    ]);
    expect(totals.cost_by_currency).toEqual({ USD: 1.25, CNY: 8 });
  });

  it('builds a daily series covering the selected window', () => {
    const now = Date.parse('2026-08-16T18:00:00');
    const series = buildUsageDailySeries([event({ recorded_at: now, input_tokens: 12, output_tokens: 3 })], '7d', now);

    expect(series).toHaveLength(7);
    expect(series.at(-1)).toMatchObject({ date: '2026-08-16', total_tokens: 15, input_tokens: 12, output_tokens: 3 });
    expect(series[0]?.total_tokens).toBe(0);
  });

  it('sizes the all-range trend from the earliest event instead of a fixed 30 days', () => {
    const now = Date.parse('2026-08-16T18:00:00');
    const events = [event({ recorded_at: now - 9 * 24 * 60 * 60 * 1000, input_tokens: 4 })];
    expect(resolveUsageTrendDays(events, 'all', now)).toBe(10);
    expect(resolveUsageTrendDays([], 'all', now)).toBe(7);
    expect(buildUsageDailySeries(events, 'all', now)).toHaveLength(10);
  });

  it('exports complete CSV rows with escaped and formula-safe text', () => {
    const csv = usageEventsToCsv([
      event({
        fingerprint: '=formula',
        turn_id: 'turn-1',
        conversation_name: 'Plan, "v2"',
        cached_read_tokens: 7,
        cached_write_tokens: 2,
        input_tokens: 3,
        output_tokens: 1,
        recorded_at: Date.parse('2026-08-16T00:00:00.000Z'),
      }),
    ]);
    expect(csv).toContain('"Plan, ""v2"""');
    expect(csv).toContain("'=formula");
    expect(csv).toContain('fingerprint,turn_id');
    expect(csv).toContain('cached_read_tokens,cached_write_tokens');
    expect(csv.split('\n')).toHaveLength(2);
  });

  it('groups spend by agent and assistant and keeps unknown labels', () => {
    const events = [
      event({
        backend: 'deepseek-harness',
        assistant_name: 'Preview',
        assistant_id: 'asst-1',
        input_tokens: 30,
        output_tokens: 10,
      }),
      event({ backend: 'aionrs', input_tokens: 5, output_tokens: 1 }),
      event({ backend: 'deepseek-harness', assistant_id: 'asst-1', assistant_name: 'Preview', input_tokens: 4 }),
    ];

    expect(breakdownUsageByAgent(events, 'Unknown agent')[0]).toMatchObject({
      key: 'deepseek-harness',
      label: 'Retired runtime',
      total_tokens: 44,
      turn_count: 2,
    });
    expect(breakdownUsageByAgent(events, 'Unknown agent', 'Retired runtime', { aionrs: 'CSBU WorkMate' })).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'aionrs', label: 'CSBU WorkMate', total_tokens: 6 })])
    );
    expect(breakdownUsageByAssistant(events, 'Unknown assistant')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'asst-1', label: 'Preview', total_tokens: 44 }),
        expect.objectContaining({ key: 'unknown', label: 'Unknown assistant', total_tokens: 6 }),
      ])
    );
  });

  it('exports the WorkMate display name without changing the stored backend key', () => {
    const source = event({ backend: 'aionrs', input_tokens: 5 });
    const csv = usageEventsToCsv([source], { aionrs: 'CSBU WorkMate' });

    expect(csv).toContain(',CSBU WorkMate,');
    expect(source.backend).toBe('aionrs');
  });

  it('groups spend by model and recent conversation', () => {
    const events = [
      event({
        conversation_id: 'conv-a',
        conversation_name: ' steeper ',
        model_id: 'kimi-k2',
        input_tokens: 10,
        recorded_at: 20,
      }),
      event({
        id: 'e2',
        conversation_id: 'conv-a',
        conversation_name: 'Planning',
        model_id: 'kimi-k2',
        input_tokens: 4,
        recorded_at: 40,
      }),
      event({ id: 'e3', conversation_id: 'conv-b', model_id: 'glm-4', input_tokens: 7, recorded_at: 30 }),
    ];

    expect(breakdownUsageByModel(events, 'Unknown model')[0]).toMatchObject({
      key: 'kimi-k2',
      total_tokens: 14,
      turn_count: 2,
    });
    expect(filterUsageEventsByModel(events, 'glm-4')).toHaveLength(1);
    expect(filterUsageEventsByModel(events, 'all')).toHaveLength(3);
    expect(resolveUsageModelFilter('kimi-k2', ['kimi-k2', 'glm-4'])).toBe('kimi-k2');
    expect(resolveUsageModelFilter('kimi-k2', ['glm-4'])).toBe('all');
    expect(breakdownUsageByConversation(events, 'Untitled')[0]).toMatchObject({
      conversation_id: 'conv-a',
      label: 'Planning',
      total_tokens: 14,
      turn_count: 2,
    });
    expect(conversationSpendTokens(events, 'conv-b')).toBe(7);
    expect(
      breakdownUsageByChannel(
        [
          event({ conversation_source: 'lark', input_tokens: 5 }),
          event({ conversation_source: 'lark', input_tokens: 2 }),
        ],
        'Unknown'
      )[0]
    ).toMatchObject({ key: 'lark', label: 'lark', turn_count: 2, total_tokens: 7 });
    expect(
      breakdownUsageByChannel([event({ conversation_source: undefined, input_tokens: 4 })], 'Unknown', {
        workmate: 'WorkMate',
      })[0]
    ).toMatchObject({ key: 'workmate', label: 'WorkMate', total_tokens: 4 });
    expect(resolveUsageChannelLabel('aionui', { workmate: 'WorkMate' }, 'Unknown')).toBe('WorkMate');
  });

  it('preserves Codex-style input and uses its normalized turn total', () => {
    const inclusive = event({ input_tokens: 14_600, output_tokens: 15, cached_read_tokens: 14_000 });
    expect(usageEventSpendInput(inclusive)).toBe(14_600);
    expect(summarizeUsageEvents([inclusive])).toMatchObject({
      input_tokens: 14_600,
      output_tokens: 15,
      total_tokens: 14_615,
      cached_read_tokens: 14_000,
    });
  });

  it('counts Claude-style cache buckets in the normalized total', () => {
    const exclusive = event({
      input_tokens: 80,
      output_tokens: 15,
      cached_read_tokens: 14_000,
      total_tokens: 14_095,
    });
    expect(usageEventSpendInput(exclusive)).toBe(80);
    expect(summarizeUsageEvents([exclusive]).total_tokens).toBe(14_095);
  });

  it('returns empty totals for an empty event list', () => {
    expect(summarizeUsageEvents([])).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      thought_tokens: 0,
      cached_read_tokens: 0,
      cached_write_tokens: 0,
      total_tokens: 0,
      cost_amount: 0,
      cost_by_currency: {},
      turn_count: 0,
      conversation_count: 0,
    });
  });
});
