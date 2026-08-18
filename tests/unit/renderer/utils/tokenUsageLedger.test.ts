/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '@/common/config/storageKeys';
import {
  clearUsageLedger,
  createEmptyUsageLedger,
  parseUsageLedger,
  recordTurnUsage,
  writeUsageLedger,
  type UsageLedgerStorage,
} from '@/renderer/utils/chat/tokenUsageLedger';

const memoryStorage = (initial: Record<string, string> = {}): UsageLedgerStorage => {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
};

describe('tokenUsageLedger', () => {
  afterEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.TOKEN_USAGE_LEDGER);
    }
  });

  it('ignores mid-turn snapshots that have no spend', () => {
    const storage = memoryStorage();
    expect(
      recordTurnUsage(
        {
          conversation_id: 'conv-1',
          source: 'acp',
        },
        storage
      )
    ).toBeNull();
    expect(parseUsageLedger(storage.getItem(STORAGE_KEYS.TOKEN_USAGE_LEDGER)).events).toEqual([]);
  });

  it('records an end-of-turn breakdown once and skips the same fingerprint', () => {
    const storage = memoryStorage();
    const first = recordTurnUsage(
      {
        conversation_id: 'conv-1',
        turn_id: 'turn-1',
        backend: 'deepseek-harness',
        assistant_name: 'DeepSeek',
        breakdown: { input_tokens: 120, output_tokens: 40 },
        source: 'acp',
      },
      storage
    );
    const second = recordTurnUsage(
      {
        conversation_id: 'conv-1',
        turn_id: 'turn-1',
        backend: 'deepseek-harness',
        breakdown: { input_tokens: 120, output_tokens: 40 },
        source: 'acp',
      },
      storage
    );

    expect(first?.input_tokens).toBe(120);
    expect(first?.output_tokens).toBe(40);
    expect(second).toBeNull();
    expect(parseUsageLedger(storage.getItem(STORAGE_KEYS.TOKEN_USAGE_LEDGER)).events).toHaveLength(1);
  });

  it('stores only the positive cost delta against the previous session total', () => {
    const storage = memoryStorage();
    recordTurnUsage(
      {
        conversation_id: 'conv-1',
        turn_id: 'turn-1',
        breakdown: { input_tokens: 10, output_tokens: 5 },
        cost: { amount: 0.2, currency: 'USD' },
        source: 'acp',
      },
      storage
    );
    const second = recordTurnUsage(
      {
        conversation_id: 'conv-1',
        turn_id: 'turn-2',
        breakdown: { input_tokens: 8, output_tokens: 4 },
        cost: { amount: 0.35, currency: 'USD' },
        source: 'acp',
      },
      storage
    );

    expect(second?.cost_delta).toBeCloseTo(0.15);
    expect(parseUsageLedger(storage.getItem(STORAGE_KEYS.TOKEN_USAGE_LEDGER)).events).toHaveLength(2);
  });

  it('rejects a corrupted ledger payload instead of throwing', () => {
    expect(parseUsageLedger('{not-json')).toEqual(createEmptyUsageLedger());
    expect(parseUsageLedger('[]')).toEqual(createEmptyUsageLedger());
  });

  it('drops malformed events before they can poison totals with NaN', () => {
    const malformed = {
      ...createEmptyUsageLedger(),
      events: [
        {
          id: 'broken',
          recorded_at: Date.now(),
          conversation_id: 'conv-1',
          fingerprint: 'turn:1',
          backend: 'acp',
          source: 'acp',
          input_tokens: 10,
        },
      ],
    };

    expect(parseUsageLedger(JSON.stringify(malformed)).events).toEqual([]);
  });

  it('drops malformed optional metadata and cached ledger indexes', () => {
    const malformed = {
      ...createEmptyUsageLedger(),
      events: [
        {
          id: 'broken',
          recorded_at: Date.now(),
          conversation_id: 'conv-1',
          fingerprint: 'turn:1',
          backend: 'acp',
          assistant_name: { unsafe: true },
          source: 'acp',
          input_tokens: 10,
          output_tokens: 1,
          thought_tokens: 0,
          cached_read_tokens: 0,
          cached_write_tokens: 0,
          cost_delta: 0,
        },
      ],
      last_cost_by_conversation: { 'conv-1': { amount: 'NaN', currency: [] } },
      last_fingerprint_by_conversation: { 'conv-1': { bad: true } },
    };

    const parsed = parseUsageLedger(JSON.stringify(malformed));
    expect(parsed.events).toEqual([]);
    expect(parsed.last_cost_by_conversation).toEqual({});
    expect(parsed.last_fingerprint_by_conversation).toEqual({});
  });

  it('survives unavailable local storage', () => {
    const storage: UsageLedgerStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => writeUsageLedger(createEmptyUsageLedger(), storage)).not.toThrow();
    expect(
      recordTurnUsage({ conversation_id: 'conv', breakdown: { input_tokens: 1 }, source: 'acp' }, storage)
    ).not.toBeNull();
  });

  it('clears recorded history', () => {
    const storage = memoryStorage();
    writeUsageLedger(
      {
        ...createEmptyUsageLedger(),
        events: [
          {
            id: 'e1',
            recorded_at: Date.now(),
            conversation_id: 'conv-1',
            fingerprint: 'turn:1',
            backend: 'aionrs',
            input_tokens: 1,
            output_tokens: 1,
            thought_tokens: 0,
            cached_read_tokens: 0,
            cached_write_tokens: 0,
            cost_delta: 0,
            source: 'aionrs',
          },
        ],
      },
      storage
    );

    const cleared = clearUsageLedger(storage);
    expect(cleared.events).toEqual([]);
    expect(cleared.backfill_suppressed).toBe(true);
    expect(parseUsageLedger(storage.getItem(STORAGE_KEYS.TOKEN_USAGE_LEDGER)).backfill_suppressed).toBe(true);
  });

  it('does not treat cache-only updates as token spend', () => {
    const storage = memoryStorage();
    expect(
      recordTurnUsage(
        {
          conversation_id: 'conv-1',
          breakdown: { cached_read_tokens: 8_000 },
          source: 'acp',
        },
        storage
      )
    ).toBeNull();
  });
});
