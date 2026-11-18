/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { remoteBackend, type IRemoteBackendStatus } from '@/common/adapter/ipcBridge';
import {
  getUpdateReadyState,
  subscribeUpdateReadyState,
  type UpdateReadyState,
} from '@/renderer/components/settings/updateReadyState';
import { useTokenUsageStats } from '@/renderer/hooks/chat/useTokenUsageStats';
import { filterUsageToday, summarizeUsageEvents } from '@/renderer/utils/chat/tokenUsageAggregate';
import { isElectronDesktop } from '@/renderer/utils/platform';

export type HostSignal = { mode: 'local' } | { mode: 'remote'; host: string };

/** Host label for a remote backend URL; falls back to the raw value when it is not a URL. */
export function remoteHostLabel(baseUrl: string | undefined): string {
  if (!baseUrl) return '';
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/** Desktop only: whether the app talks to its own backend or a remote Host. `null` in WebUI. */
export function useHostSignal(): HostSignal | null {
  const desktop = isElectronDesktop();
  const [status, setStatus] = useState<IRemoteBackendStatus | null>(null);
  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => remoteBackend.getStatus.invoke())
      .then((next) => {
        if (!cancelled && next) setStatus(next);
      })
      .catch(() => {
        // Bridge unavailable (tests, older shells): treat as local.
      });
    return () => {
      cancelled = true;
    };
  }, [desktop]);
  if (!desktop) return null;
  if (status?.mode === 'remote') return { mode: 'remote', host: remoteHostLabel(status.baseUrl) };
  return { mode: 'local' };
}

/** Tokens used today across all conversations. */
export function useTodayTokens(): number {
  const { events } = useTokenUsageStats('all');
  return useMemo(() => summarizeUsageEvents(filterUsageToday(events)).total_tokens, [events]);
}

/** The downloaded-update state the About page also reads. */
export function useUpdateReady(): UpdateReadyState {
  const [state, setState] = useState<UpdateReadyState>(() => getUpdateReadyState());
  useEffect(() => subscribeUpdateReadyState(setState), []);
  return state;
}
