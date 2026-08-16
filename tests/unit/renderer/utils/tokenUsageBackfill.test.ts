/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import { STORAGE_KEYS } from '@/common/config/storageKeys';
import {
  backfillUsageFromConversations,
  conversationModelId,
  usageInputFromConversation,
} from '@/renderer/utils/chat/tokenUsageBackfill';
import {
  clearUsageLedger,
  parseUsageLedger,
  recordTurnUsage,
  type UsageLedgerStorage,
} from '@/renderer/utils/chat/tokenUsageLedger';

const memoryStorage = (): UsageLedgerStorage => {
  const data: Record<string, string> = {};
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
};

describe('tokenUsageBackfill', () => {
  it('skips ACP occupancy-only snapshots', () => {
    expect(
      usageInputFromConversation({
        id: 'conv-1',
        type: 'acp',
        name: 'Claude chat',
        created_at: 1,
        modified_at: 2,
        extra: { backend: 'claude', last_token_usage: { total_tokens: 18_000 } },
      } as TChatConversation)
    ).toBeNull();
  });

  it('reads the persisted model id from ACP and WorkMate conversations', () => {
    expect(
      conversationModelId({
        type: 'acp',
        extra: { backend: 'claude', current_model_id: 'kimi-k2' },
      } as TChatConversation)
    ).toBe('kimi-k2');
    expect(
      conversationModelId({
        type: 'aionrs',
        extra: {},
        model: { id: 'prov', use_model: 'openai/gpt-4.1' },
      } as TChatConversation)
    ).toBe('openai/gpt-4.1');
  });

  it('keeps an ACP row that has a per-turn breakdown', () => {
    const input = usageInputFromConversation({
      id: 'conv-2',
      type: 'acp',
      name: 'DeepSeek chat',
      created_at: 10,
      modified_at: 20,
      assistant: { id: 'asst-1', source: 'builtin', name: 'Preview', avatar: '', backend: 'deepseek-harness' },
      extra: {
        backend: 'deepseek-harness',
        current_model_id: 'deepseek-chat',
        last_token_usage: {
          total_tokens: 900,
          breakdown: { input_tokens: 700, output_tokens: 200 },
        },
      },
    } as TChatConversation);

    expect(input).toMatchObject({
      conversation_id: 'conv-2',
      turn_id: 'backfill:conv-2',
      backend: 'deepseek-harness',
      conversation_name: 'DeepSeek chat',
      model_id: 'deepseek-chat',
      breakdown: { input_tokens: 700, output_tokens: 200 },
      source: 'acp',
      recorded_at: 20,
    });
  });

  it('treats aionrs last_token_usage as last-turn spend', () => {
    const input = usageInputFromConversation({
      id: 'conv-3',
      type: 'aionrs',
      name: 'WorkMate',
      created_at: 1,
      extra: { last_token_usage: { total_tokens: 420 } },
    } as TChatConversation);

    expect(input?.breakdown).toEqual({ input_tokens: 420 });
    expect(input?.source).toBe('aionrs');
  });

  it('writes only new backfill events into the ledger', () => {
    const storage = memoryStorage();
    const conversation = {
      id: 'conv-4',
      type: 'aionrs',
      name: 'Repeat',
      created_at: Date.now(),
      extra: { last_token_usage: { total_tokens: 12, breakdown: { input_tokens: 8, output_tokens: 4 } } },
    } as TChatConversation;

    expect(backfillUsageFromConversations([conversation], storage)).toBe(1);
    expect(backfillUsageFromConversations([conversation], storage)).toBe(0);
    expect(parseUsageLedger(storage.getItem(STORAGE_KEYS.TOKEN_USAGE_LEDGER)).events).toHaveLength(1);
  });

  it('does not backfill a conversation that already has live turn events', () => {
    const storage = memoryStorage();
    recordTurnUsage(
      {
        conversation_id: 'conv-5',
        turn_id: 'live-1',
        breakdown: { input_tokens: 10, output_tokens: 4 },
        source: 'acp',
      },
      storage
    );

    expect(
      backfillUsageFromConversations(
        [
          {
            id: 'conv-5',
            type: 'acp',
            name: 'Already live',
            created_at: Date.now(),
            extra: {
              backend: 'claude',
              last_token_usage: { total_tokens: 14, breakdown: { input_tokens: 10, output_tokens: 4 } },
            },
          } as TChatConversation,
        ],
        storage
      )
    ).toBe(0);
    expect(parseUsageLedger(storage.getItem(STORAGE_KEYS.TOKEN_USAGE_LEDGER)).events).toHaveLength(1);
  });

  it('does not re-import snapshots after the user clears history', () => {
    const storage = memoryStorage();
    const conversation = {
      id: 'conv-6',
      type: 'aionrs',
      name: 'Cleared',
      created_at: Date.now(),
      extra: { last_token_usage: { total_tokens: 30, breakdown: { input_tokens: 20, output_tokens: 10 } } },
    } as TChatConversation;

    expect(backfillUsageFromConversations([conversation], storage)).toBe(1);
    clearUsageLedger(storage);
    expect(backfillUsageFromConversations([conversation], storage)).toBe(0);
    expect(parseUsageLedger(storage.getItem(STORAGE_KEYS.TOKEN_USAGE_LEDGER)).events).toEqual([]);
  });
});
