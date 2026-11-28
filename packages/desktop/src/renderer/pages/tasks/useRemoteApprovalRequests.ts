/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ApprovalRequest } from '@/common/types/remoteApproval';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 3.0 U9: a task's remote approval requests, refreshed when Core pushes
 * `approval.request.changed` for it. Older cores (no C9) give `null`.
 */
export const useRemoteApprovalRequests = (
  taskId: string | null | undefined
): { requests: ApprovalRequest[] | null; reload: () => void } => {
  const [requests, setRequests] = useState<ApprovalRequest[] | null>(null);
  const seq = useRef(0);
  const load = useCallback(() => {
    const api = ipcBridge.remoteApproval?.listForTask;
    if (!taskId || !api) {
      setRequests(null);
      return;
    }
    const mine = ++seq.current;
    api
      .invoke({ task_session_id: taskId })
      .then((list) => {
        if (mine === seq.current) setRequests(Array.isArray(list) ? list : null);
      })
      .catch(() => {
        if (mine === seq.current) setRequests(null);
      });
  }, [taskId]);

  useEffect(() => {
    setRequests(null);
    load();
    if (!taskId) return undefined;
    const off = ipcBridge.remoteApproval?.changed?.on?.((event) => {
      if (event?.task_session_id === taskId) load();
    });
    return () => {
      seq.current += 1;
      if (typeof off === 'function') off();
    };
  }, [taskId, load]);

  return { requests, reload: load };
};
