/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReviewDelivery, ReviewThread } from '@/common/types/agent/taskSession';
import { isUnresolved } from './annotateModel';

/** Conversation id of the `/conversation/:id` page in a hash route, if any. */
export const routeConversationId = (hash: string): string | undefined => {
  const path = hash.replace(/^#/, '').split(/[?#]/)[0] ?? '';
  const match = /^\/conversation\/([^/]+)\/?$/.exec(path);
  return match ? decodeURIComponent(match[1]) : undefined;
};

/**
 * Default target of "send to agent" (design §2.2): the conversation that made
 * the change (a TaskRun's conversation, carried on the scope), else the
 * conversation the diff is open in.
 */
export const defaultTargetId = (scope: { conversation_id?: string }, routeId: string | undefined): string | undefined =>
  scope.conversation_id || routeId || undefined;

/** "Insert into the current turn" needs a running turn and a steer-capable agent. */
export const canSteer = (capabilities: { steer?: boolean } | null | undefined, running: boolean): boolean =>
  Boolean(capabilities?.steer) && running;

/** What the client asks for: Core still degrades steer to followup when the turn ended. */
export const requestedDelivery = (steer: boolean): ReviewDelivery => (steer ? 'steer' : 'followup');

const byteOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Unresolved threads of a scope in the order Core numbers them (#1, #2, …). */
export const batchThreads = (threads: ReviewThread[]): ReviewThread[] =>
  threads
    .filter(isUnresolved)
    .sort(
      (a, b) =>
        byteOrder(a.file_path, b.file_path) ||
        a.start_line - b.start_line ||
        a.created_at - b.created_at ||
        byteOrder(a.id, b.id)
    );
