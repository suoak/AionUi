/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { useEffect, useRef, useState } from 'react';

/**
 * 3.0 U7: the assistants the `@` menu offers for delegation. Loaded once the
 * first time the menu opens; an older or unreachable Core just yields none.
 */
export const useDelegableAssistants = (enabled: boolean): Assistant[] => {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const requested = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || requested.current) return;
    const list = ipcBridge.assistants?.list;
    if (!list) return;
    requested.current = true;
    Promise.resolve()
      .then(() => list.invoke())
      .then((rows) => {
        if (mounted.current && Array.isArray(rows)) setAssistants(rows);
      })
      .catch(() => {
        // Best effort: without the catalog the menu shows files only.
      });
  }, [enabled]);

  return assistants;
};
