/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** 3.0 C7 `@assistant` delegation (aioncore ≥ 0.6). */
export type DelegationStatus = 'starting' | 'running' | 'completed' | 'failed' | (string & {});

export type Delegation = {
  id: string;
  parent_conversation_id: string;
  child_conversation_id?: string | null;
  assistant_id: string;
  task_text: string;
  status: DelegationStatus;
  error?: string | null;
  /** The child's final reply, once completed. */
  result_text?: string | null;
  created_at: number;
  updated_at: number;
};

/** Core allows this many unfinished delegations per conversation. */
export const MAX_CONCURRENT_DELEGATIONS = 3;

export const isDelegationActive = (d: Pick<Delegation, 'status'>): boolean =>
  d.status === 'starting' || d.status === 'running';
