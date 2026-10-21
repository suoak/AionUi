/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IAgentApprovalRecord } from '@/common/adapter/ipcBridge';
import { applyApprovalEvent, pruneApprovalQueue } from '@/renderer/components/agentApproval/agentApprovalQueue';

const record = (id: string, overrides: Partial<IAgentApprovalRecord> = {}): IAgentApprovalRecord => ({
  id,
  user_id: 'u1',
  conversation_id: 'c1',
  kind: 'mcp',
  method: 'POST',
  path: '/api/mcp/servers',
  summary: '{}',
  status: 'pending',
  created_at: 1_000,
  expires_at: 10_000,
  ...overrides,
});

describe('agent approval queue', () => {
  it('adds pending approvals oldest first and replaces duplicates', () => {
    let queue = applyApprovalEvent([], record('b', { created_at: 2_000 }), 5_000);
    queue = applyApprovalEvent(queue, record('a', { created_at: 1_000 }), 5_000);
    queue = applyApprovalEvent(queue, record('a', { created_at: 1_000, summary: 'new' }), 5_000);
    expect(queue.map((item) => item.id)).toEqual(['a', 'b']);
    expect(queue[0].summary).toBe('new');
  });

  it('drops resolved approvals', () => {
    const queue = applyApprovalEvent([record('a'), record('b')], record('a', { status: 'approved' }), 5_000);
    expect(queue.map((item) => item.id)).toEqual(['b']);
  });

  it('prunes expired and non-pending approvals', () => {
    const queue = pruneApprovalQueue(
      [record('a', { expires_at: 4_000 }), record('b', { status: 'denied' }), record('c')],
      5_000
    );
    expect(queue.map((item) => item.id)).toEqual(['c']);
  });
});
