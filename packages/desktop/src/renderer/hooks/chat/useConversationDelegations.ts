/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isDelegationActive, type Delegation } from '@/common/types/delegation';
import { useCallback, useEffect, useRef, useState } from 'react';

export const DELEGATION_POLL_MS = 4000;

/**
 * 3.0 U7: delegations started from this conversation. Core pushes no event,
 * so this polls while the agent runs or a delegation is unfinished, and once
 * more when the turn ends. An older Core (404) yields an empty list.
 */
export const useConversationDelegations = (conversationId: string | undefined, agentRunning: boolean) => {
  const [items, setItems] = useState<Delegation[]>([]);
  const unsupported = useRef(false);

  const refresh = useCallback(() => {
    const list = ipcBridge.delegation?.list;
    if (!conversationId || !list || unsupported.current) return Promise.resolve();
    return list
      .invoke({ conversation_id: conversationId })
      .then((rows) => setItems(Array.isArray(rows) ? rows : []))
      .catch((error: unknown) => {
        if ((error as { status?: number })?.status === 404) unsupported.current = true;
      });
  }, [conversationId]);

  useEffect(() => {
    unsupported.current = false;
    setItems([]);
    void refresh();
  }, [refresh]);

  const hasActive = items.some(isDelegationActive);
  const wasBusy = useRef(false);
  useEffect(() => {
    const busy = agentRunning || hasActive;
    const settled = wasBusy.current && !busy;
    wasBusy.current = busy;
    if (!busy) {
      // The turn just ended: one last read for delegations it started.
      if (settled) void refresh();
      return undefined;
    }
    const timer = setInterval(() => void refresh(), DELEGATION_POLL_MS);
    return () => clearInterval(timer);
  }, [agentRunning, hasActive, refresh]);

  return { items, refresh };
};
