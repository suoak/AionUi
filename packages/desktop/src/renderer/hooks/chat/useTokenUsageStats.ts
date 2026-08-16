/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useState } from 'react';
import { useAddEventListener } from '@/renderer/utils/emitter';
import {
  filterUsageEvents,
  type UsageRange,
} from '@/renderer/utils/chat/tokenUsageAggregate';
import {
  clearUsageLedger,
  readUsageLedger,
  type UsageEvent,
} from '@/renderer/utils/chat/tokenUsageLedger';

export const useTokenUsageStats = (range: UsageRange) => {
  const [revision, setRevision] = useState(0);

  const events = useMemo(() => {
    void revision;
    return readUsageLedger().events;
  }, [revision]);

  const visibleEvents = useMemo(() => filterUsageEvents(events, range), [events, range]);

  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const clear = useCallback((): UsageEvent[] => {
    clearUsageLedger();
    setRevision((value) => value + 1);
    return [];
  }, []);

  useAddEventListener('token.usage.recorded', refresh, [refresh]);

  return {
    events,
    visibleEvents,
    refresh,
    clear,
  };
};
