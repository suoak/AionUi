/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import useSWR from 'swr';

/** Probe Core once: an older Core without `/api/fanout-groups` (404) reads as unsupported. */
const probe = async (): Promise<boolean> => {
  try {
    await ipcBridge.fanout.list.invoke(undefined);
    return true;
  } catch {
    return false;
  }
};

/** Whether the Guid page may offer Fan-out (design E3 §4.2). */
export const useFanoutSupported = (enabled: boolean): boolean => {
  const { data = false } = useSWR(enabled ? 'fanout.supported' : null, probe, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  return enabled && data;
};
