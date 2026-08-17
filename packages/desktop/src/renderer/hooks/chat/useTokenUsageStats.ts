/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { UsageEventDto } from '@/common/adapter/ipcBridge';
import { useAddEventListener } from '@/renderer/utils/emitter';
import { filterUsageEvents, type UsageRange } from '@/renderer/utils/chat/tokenUsageAggregate';
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
  fingerprint: event.id,
  backend: event.backend,
  assistant_id: event.assistant_id ?? undefined,
  assistant_name: event.assistant_name ?? undefined,
  conversation_name: event.conversation_name ?? undefined,
  conversation_source: event.conversation_source,
  model_id: event.model_id ?? undefined,
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

  const refresh = useCallback(() => {
    void ipcBridge.usage.list
      .invoke({ limit: 5000 })
      .then((page) => {
        if (!page?.events) {
          throw new Error('usage list unavailable');
        }
        setUsesBackend(true);
        // An empty backend ledger is not proof that nothing was spent —
        // older cores return `{ events: [] }` for dialects they cannot
        // persist (Grok `_x.ai/session/update`). Keep any local records.
        if (page.events.length > 0) {
          setEvents(page.events.map(mapUsageDto));
          return;
        }
        setEvents(readUsageLedger().events);
      })
      .catch(() => {
        setUsesBackend(false);
        setEvents(readUsageLedger().events);
      });
  }, []);

  const clear = useCallback((): UsageEvent[] => {
    void ipcBridge.usage.clear.invoke().catch((): void => undefined);
    clearUsageLedger();
    setEvents([]);
    return [];
  }, []);

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
