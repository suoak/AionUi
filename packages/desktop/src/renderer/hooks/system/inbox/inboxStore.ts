/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useSyncExternalStore } from 'react';
import { ipcBridge } from '@/common';
import type { IInboxChangedEvent } from '@/common/adapter/ipcBridge';

/**
 * Inbox availability + unread count, shared by the sider entry and the
 * notification gating. `unknown` until the first probe answers; older cores
 * (no `/api/inbox`) settle on `unsupported` and every inbox surface degrades
 * to "not shown", leaving the legacy notification behaviour untouched.
 */
export type InboxSupport = 'unknown' | 'supported' | 'unsupported';

type InboxState = { support: InboxSupport; unread: number; revision: number };

let state: InboxState = { support: 'unknown', unread: 0, revision: 0 };
const listeners = new Set<() => void>();
let probe: Promise<void> | null = null;

const emit = (next: Partial<InboxState>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

export const getInboxState = (): InboxState => state;

/** True only once Core has answered `/api/inbox` successfully. */
export const isInboxSupported = (): boolean => state.support === 'supported';

export const subscribeInbox = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setInboxUnread = (unread: number): void => {
  emit({ support: 'supported', unread: Math.max(0, unread), revision: state.revision + 1 });
};

/** Probe once per session; an error (404 on older cores) marks it unsupported. */
export const probeInbox = (): Promise<void> => {
  if (probe) return probe;
  probe = Promise.resolve()
    .then(() => ipcBridge.inbox.list.invoke({ limit: 1 }))
    .then((res) => setInboxUnread(res?.unread_count ?? 0))
    .catch(() => {
      emit({ support: 'unsupported' });
    });
  return probe;
};

export const applyInboxChanged = (event: IInboxChangedEvent | undefined): void => {
  if (!event || typeof event.unread_count !== 'number') return;
  setInboxUnread(event.unread_count);
};

export type InboxAttentionKind = 'failed' | 'blocked';

/**
 * Which `inbox.changed` events deserve a system notification: failed and
 * blocked turns only. Completed turns stay silent in the inbox, approvals are
 * already notified by the confirmation stream, and read/resolve updates carry
 * no actionable kind.
 */
export const inboxAttentionKind = (event: IInboxChangedEvent | undefined): InboxAttentionKind | null => {
  if (!event) return null;
  return event.kind === 'failed' || event.kind === 'blocked' ? event.kind : null;
};

export const inboxNotificationBody = (
  t: (key: string, options?: Record<string, unknown>) => string,
  kind: InboxAttentionKind,
  name?: string
): string => {
  if (kind === 'blocked') {
    return name ? t('common.inbox.notifyBlockedNamed', { name }) : t('common.inbox.notifyBlocked');
  }
  return name ? t('common.inbox.notifyFailedNamed', { name }) : t('common.inbox.notifyFailed');
};

/** Test hook: reset module state between cases. */
export const resetInboxStoreForTests = (): void => {
  state = { support: 'unknown', unread: 0, revision: 0 };
  probe = null;
};

/**
 * Subscribe to inbox state. Mounting it triggers the one-off probe and keeps
 * the unread count live from `inbox.changed`.
 */
export const useInboxState = (): InboxState => {
  useEffect(() => {
    void probeInbox();
    const dispose = ipcBridge.inbox?.changed?.on?.(applyInboxChanged);
    return () => {
      dispose?.();
    };
  }, []);
  return useSyncExternalStore(subscribeInbox, getInboxState, getInboxState);
};
