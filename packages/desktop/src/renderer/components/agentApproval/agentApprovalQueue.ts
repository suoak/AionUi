/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IAgentApprovalRecord } from '@/common/adapter/ipcBridge';

/**
 * Merge a pending-approval list with one approval event: pending records are
 * added (or refreshed), anything resolved/expired is dropped. Expired-by-time
 * records are pruned too. Result is ordered oldest first.
 */
export function applyApprovalEvent(
  queue: IAgentApprovalRecord[],
  record: IAgentApprovalRecord,
  now: number = Date.now()
): IAgentApprovalRecord[] {
  const rest = queue.filter((item) => item.id !== record.id);
  const next = record.status === 'pending' ? [...rest, record] : rest;
  return pruneApprovalQueue(next, now);
}

export function pruneApprovalQueue(queue: IAgentApprovalRecord[], now: number = Date.now()): IAgentApprovalRecord[] {
  return queue
    .filter((item) => item.status === 'pending' && item.expires_at > now)
    .toSorted((a, b) => a.created_at - b.created_at);
}
