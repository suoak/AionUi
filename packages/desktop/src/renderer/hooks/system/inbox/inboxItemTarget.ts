/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IInboxItem } from '@/common/adapter/ipcBridge';

/**
 * Where an inbox item opens, in priority order: the task board drawer (E6-6), the
 * batch job (E8), the source conversation, then an Autopilot scheduled task (E8).
 * Returns `null` when the item has nowhere to go.
 */
export function inboxItemTarget(item: IInboxItem): string | null {
  if (item.task_session_id) return `/tasks?${new URLSearchParams({ task: item.task_session_id }).toString()}`;
  if (item.origin === 'batch' && item.source_id) {
    return `/batch?${new URLSearchParams({ job: item.source_id }).toString()}`;
  }
  if (item.conversation_id) return `/conversation/${item.conversation_id}`;
  if (item.origin === 'autopilot' && item.source_id) return `/scheduled/${encodeURIComponent(item.source_id)}`;
  return null;
}
