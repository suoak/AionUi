/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TaskRunReplayPage, TaskTraceEvent } from '@/common/types/agent/taskSession';

export type ReplayState = {
  events: TaskTraceEvent[];
  cursor: number;
  hasMore: boolean;
  latestSequence: number;
  /** Some page reported pruned/missing sequences. */
  retentionGap: boolean;
};

export const emptyReplay: ReplayState = {
  events: [],
  cursor: 0,
  hasMore: true,
  latestSequence: 0,
  retentionGap: false,
};

/** Append one page; events are de-duplicated by sequence and kept in order. */
export function mergeReplayPage(state: ReplayState, page: TaskRunReplayPage): ReplayState {
  const seen = new Set(state.events.map((event) => event.sequence));
  const events = [...state.events, ...page.events.filter((event) => !seen.has(event.sequence))].sort(
    (a, b) => a.sequence - b.sequence
  );
  return {
    events,
    cursor: Math.max(state.cursor, page.next_after_sequence),
    hasMore: page.has_more,
    latestSequence: Math.max(state.latestSequence, page.latest_sequence),
    retentionGap: state.retentionGap || page.retention_gap,
  };
}

/** Number of sequences missing between consecutive retained events (and before the first). */
export function missingBefore(events: TaskTraceEvent[], index: number): number {
  const previous = index === 0 ? 0 : events[index - 1].sequence;
  return Math.max(0, events[index].sequence - previous - 1);
}

export const isErrorEvent = (event: TaskTraceEvent) =>
  event.event_type.endsWith('.failed') || event.event_type.endsWith('.denied') || event.event_type === 'error';
