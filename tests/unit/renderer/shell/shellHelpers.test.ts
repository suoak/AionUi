/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IInboxItem } from '@/common/adapter/ipcBridge';
import { inboxItemTarget } from '@/renderer/hooks/system/inbox/inboxItemTarget';
import { countConversationRuns } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';
import { remoteHostLabel } from '@/renderer/components/layout/StatusBar/useStatusBarSignals';

const item = (over: Partial<IInboxItem>): IInboxItem => ({
  id: 'i1',
  kind: 'completed',
  source_kind: 'conversation',
  source_id: 's1',
  title: 'T',
  created_at: 0,
  ...over,
});

describe('inboxItemTarget (V3 bell)', () => {
  it('prefers the task drawer, then batch, then conversation, then autopilot', () => {
    expect(inboxItemTarget(item({ task_session_id: 'ts 1', conversation_id: 'c1' }))).toBe('/tasks?task=ts+1');
    expect(inboxItemTarget(item({ origin: 'batch', source_id: 'job1', conversation_id: 'c1' }))).toBe(
      '/batch?job=job1'
    );
    expect(inboxItemTarget(item({ conversation_id: 'c1' }))).toBe('/conversation/c1');
    expect(inboxItemTarget(item({ origin: 'autopilot', source_id: 'a/b' }))).toBe('/scheduled/a%2Fb');
  });

  it('returns null when the item has nowhere to go', () => {
    expect(inboxItemTarget(item({}))).toBeNull();
  });
});

describe('countConversationRuns (V3 status bar)', () => {
  it('counts waiting conversations as needing you, not as working', () => {
    const counts = countConversationRuns(new Set(['a', 'b', 'c']), new Set(['b', 'd']));
    expect(counts).toEqual({ working: 2, needsYou: 2, firstNeedsYouId: 'b' });
  });

  it('is empty when nothing runs', () => {
    expect(countConversationRuns(new Set(), new Set())).toEqual({ working: 0, needsYou: 0, firstNeedsYouId: null });
  });
});

describe('remoteHostLabel', () => {
  it('shows host:port for URLs and passes other values through', () => {
    expect(remoteHostLabel('http://127.0.0.1:25808')).toBe('127.0.0.1:25808');
    expect(remoteHostLabel('box-1')).toBe('box-1');
    expect(remoteHostLabel(undefined)).toBe('');
  });
});
