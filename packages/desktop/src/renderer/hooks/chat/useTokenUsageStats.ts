/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { UsageEventDto } from '@/common/adapter/ipcBridge';
import { useAddEventListener } from '@/renderer/utils/emitter';
import { filterUsageEvents, reconcileUsageEvents, type UsageRange } from '@/renderer/utils/chat/tokenUsageAggregate';
import {
  clearUsageLedger,
  readUsageLedger,
  type UsageEvent,
  type UsageEventSource,
} from '@/renderer/utils/chat/tokenUsageLedger';

const mapUsageDto = (event: UsageEventDto): UsageEvent => ({
  id: event.id,
  recorded_at: event.recorded_at,
  conversation_id: event.conversation_id,
  fingerprint: event.fingerprint ?? '',
  turn_id: event.turn_id ?? undefined,
  backend: event.backend,
  assistant_id: event.assistant_id ?? undefined,
  assistant_name: event.assistant_name ?? undefined,
  conversation_name: event.conversation_name ?? undefined,
  conversation_source: event.conversation_source,
  model_id: event.model_id ?? undefined,
  total_tokens: event.total_tokens,
  input_tokens: event.input_tokens,
  output_tokens: event.output_tokens,
  thought_tokens: event.thought_tokens,
  cached_read_tokens: event.cached_read_tokens,
  cached_write_tokens: event.cached_write_tokens,
  cost_delta: event.cost_delta,
  cost_currency: event.cost_currency ?? undefined,
  source: event.event_source === 'aionrs' ? 'aionrs' : ('acp' as UsageEventSource),
});

export const useTokenUsageStats = (range: UsageRange) => {
  const [events, setEvents] = useState<UsageEvent[]>(() => readUsageLedger().events);
  const [usesBackend, setUsesBackend] = useState(false);
  const requestVersionRef = useRef(0);
  const clearingRef = useRef(false);

  const refresh = useCallback(() => {
    if (clearingRef.current) {
      return;
    }
    const requestVersion = ++requestVersionRef.current;
    void ipcBridge.usage.list
      .invoke({ limit: 50_000 })
      .then((page) => {
        if (requestVersion !== requestVersionRef.current) {
          return;
        }
        if (!page?.events) {
          throw new Error('usage list unavailable');
        }
        setUsesBackend(true);
        // Older cores may persist only some protocol dialects. Keep local-only
        // records instead of treating either source as complete on its own.
        setEvents(reconcileUsageEvents(page.events.map(mapUsageDto), readUsageLedger().events));
      })
      .catch(() => {
        if (requestVersion !== requestVersionRef.current) {
          return;
        }
        setUsesBackend(false);
        setEvents(readUsageLedger().events);
      });
  }, []);

  const clear = useCallback(async (): Promise<boolean> => {
    clearingRef.current = true;
    requestVersionRef.current += 1;
    clearUsageLedger();
    setEvents([]);
    try {
      await ipcBridge.usage.clear.invoke();
      clearingRef.current = false;
      return true;
    } catch {
      clearingRef.current = false;
      refresh();
      return false;
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useAddEventListener('token.usage.recorded', refresh, [refresh]);

  useEffect(() => {
    return ipcBridge.conversation.responseStream.on((message: IResponseMessage) => {
      if (message.type === 'acp_context_usage') {
        refresh();
      }
    });
  }, [refresh]);

  const visibleEvents = useMemo(() => filterUsageEvents(events, range), [events, range]);

  return {
    events,
    visibleEvents,
    refresh,
    clear,
    usesBackend,
  };
};
