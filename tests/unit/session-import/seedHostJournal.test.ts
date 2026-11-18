/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';

const mocks = vi.hoisted(() => ({
  seed: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: { seedImportedJournal: { invoke: mocks.seed } },
  },
}));

import { seedHostJournal, transcriptItemsToSeedPayload } from '@/common/sessionImport/seedHostJournal';
import type { JournalTranscriptItem } from '@/common/types/journalTranscript';

const item = (
  transcript_kind: string,
  content: string,
  extra: Partial<JournalTranscriptItem> = {}
): JournalTranscriptItem => ({
  sequence: 1,
  event_id: extra.event_id ?? 'e1',
  journal_kind: 'user_prompt',
  transcript_kind,
  visibility: 'model',
  summary: content.slice(0, 20),
  content,
  source_sequences: [],
  ...extra,
});

describe('transcriptItemsToSeedPayload', () => {
  it('keeps opaque text and tool call ids, drops empty rows, and never adds a path', () => {
    const payload = transcriptItemsToSeedPayload([
      item('user/message', 'hello'),
      item('assistant/message', '  '),
      item('tool/call', '{"name":"Bash"}', { event_id: 'call-1' }),
      item('tool/result', 'ok', { event_id: 'call-1' }),
    ]);
    expect(payload).toEqual([
      { transcript_kind: 'user/message', content: 'hello' },
      { transcript_kind: 'tool/call', content: '{"name":"Bash"}', call_id: 'call-1' },
      { transcript_kind: 'tool/result', content: 'ok', call_id: 'call-1' },
    ]);
    expect(JSON.stringify(payload)).not.toContain('path');
  });
});

describe('seedHostJournal', () => {
  beforeEach(() => {
    mocks.seed.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('posts items without a source path and reports seeded', async () => {
    mocks.seed.mockResolvedValue({
      conversation_id: 'c1',
      event_count: 1,
      model_visible_count: 1,
      journal_sha256: 'abc',
    });
    await expect(
      seedHostJournal({
        conversation_id: 'c1',
        items: [item('user/message', 'hello')],
        source: 'claude-code',
        source_session_id: 'sess',
      })
    ).resolves.toBe('seeded');
    expect(mocks.seed).toHaveBeenCalledWith({
      conversation_id: 'c1',
      items: [{ transcript_kind: 'user/message', content: 'hello' }],
      source: 'claude-code',
      source_session_id: 'sess',
    });
  });

  it('treats a missing route as unsupported and other errors as skipped', async () => {
    mocks.seed.mockRejectedValueOnce(
      new BackendHttpError({
        method: 'POST',
        path: '/api/conversations/c1/journal/seed',
        status: 404,
        body: { error: 'NOT_FOUND' },
      })
    );
    await expect(seedHostJournal({ conversation_id: 'c1', items: [item('user/message', 'hello')] })).resolves.toBe(
      'unsupported'
    );

    mocks.seed.mockRejectedValueOnce(new Error('offline'));
    await expect(seedHostJournal({ conversation_id: 'c1', items: [item('user/message', 'hello')] })).resolves.toBe(
      'skipped'
    );

    await expect(seedHostJournal({ conversation_id: 'c1', items: [] })).resolves.toBe('skipped');
    expect(mocks.seed).toHaveBeenCalledTimes(2);
  });
});
