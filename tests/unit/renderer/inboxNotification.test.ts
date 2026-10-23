/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({ ipcBridge: {} }));

import { createBrowserNotificationController } from '@/renderer/hooks/system/notification/browserNotificationCore';
import { inboxAttentionKind, inboxNotificationBody } from '@/renderer/hooks/system/inbox/inboxStore';

describe('inbox notification gating', () => {
  it('only failed and blocked inbox events notify', () => {
    expect(inboxAttentionKind({ unread_count: 1, kind: 'failed' })).toBe('failed');
    expect(inboxAttentionKind({ unread_count: 1, kind: 'blocked' })).toBe('blocked');
    expect(inboxAttentionKind({ unread_count: 1, kind: 'completed' })).toBeNull();
    expect(inboxAttentionKind({ unread_count: 1, kind: 'approval' })).toBeNull();
    expect(inboxAttentionKind({ unread_count: 0 })).toBeNull();
    expect(inboxAttentionKind(undefined)).toBeNull();
  });

  it('builds named and unnamed bodies', () => {
    const t = (key: string, o?: Record<string, unknown>) => (o?.name ? `${key}(${String(o.name)})` : key);
    expect(inboxNotificationBody(t, 'blocked', 'x')).toBe('common.inbox.notifyBlockedNamed(x)');
    expect(inboxNotificationBody(t, 'failed')).toBe('common.inbox.notifyFailed');
  });

  it('suppresses turn-completed notifications when the inbox owns them', () => {
    const show = vi.fn();
    let inbox = true;
    const controller = createBrowserNotificationController({
      shouldShow: () => true,
      show,
      bodyFor: (kind) => kind,
      notifyTurnCompleted: () => !inbox,
    });
    controller.onStreamMessage({ type: 'finish', conversation_id: 'c', turn_id: 't1' });
    expect(show).not.toHaveBeenCalled();
    controller.onStreamMessage({ type: 'permission', conversation_id: 'c', msg_id: 'm1' });
    expect(show).toHaveBeenCalledTimes(1);
    inbox = false;
    controller.onStreamMessage({ type: 'finish', conversation_id: 'c', turn_id: 't2' });
    expect(show).toHaveBeenCalledTimes(2);
  });
});
