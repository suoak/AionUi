/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AgentPreflight } from '@/common/types/agent/agentPreflight';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 3.0 U4: readiness of every runtime agent, keyed by agent id. Empty on
 * cores without C5, so badges simply do not show.
 */
export const useAgentPreflight = (): { byAgentId: Map<string, AgentPreflight>; reload: () => void } => {
  const [byAgentId, setByAgentId] = useState<Map<string, AgentPreflight>>(() => new Map());
  const seq = useRef(0);
  const reload = useCallback(() => {
    const api = ipcBridge.agentPreflight?.list;
    if (!api) return;
    const mine = ++seq.current;
    api
      .invoke()
      .then((list) => {
        if (mine !== seq.current) return;
        setByAgentId(new Map((Array.isArray(list) ? list : []).map((row) => [row.id, row])));
      })
      .catch(() => {
        if (mine === seq.current) setByAgentId(new Map());
      });
  }, []);
  useEffect(() => {
    reload();
    return () => {
      seq.current += 1;
    };
  }, [reload]);
  return { byAgentId, reload };
};

/** The checks worth showing: everything that is not a pass, worst first. */
export const problemChecks = (preflight: AgentPreflight): AgentPreflight['checks'] =>
  preflight.checks
    .filter((check) => check.level !== 'pass')
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'fail' ? -1 : 1));
