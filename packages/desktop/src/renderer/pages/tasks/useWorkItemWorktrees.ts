/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ipcBridge } from '@/common';
import type { WorktreeInfo } from '@/common/types/worktree';
import { workItemWorktrees } from './workItemWorktreeModel';

const EMPTY = new Map<string, WorktreeInfo>();

/**
 * M8 Q12: shared worktree per board work item, from one `GET /api/worktrees`
 * for the whole board (no per-card requests). Reloads on `worktree.changed`
 * and when `refreshKey` changes. Cores without the worktree API (404) or a
 * failing call simply show no worktree.
 */
export function useWorkItemWorktrees(
  enabled: boolean,
  refreshKey = 0
): {
  byItem: Map<string, WorktreeInfo>;
  reload: () => void;
} {
  const [byItem, setByItem] = useState<Map<string, WorktreeInfo>>(EMPTY);
  const seq = useRef(0);

  const reload = useCallback(() => {
    const list = ipcBridge.worktree?.list;
    if (!enabled || !list) return;
    const current = ++seq.current;
    list
      .invoke({})
      .then((rows) => {
        if (current === seq.current) setByItem(workItemWorktrees(rows));
      })
      .catch((error) => {
        if (current !== seq.current) return;
        console.warn('[TasksBoard] Worktree list unavailable:', error);
      });
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  useEffect(() => {
    const changed = ipcBridge.worktree?.changed;
    if (!enabled || !changed) return;
    return changed.on(() => reload());
  }, [enabled, reload]);

  return { byItem, reload };
}
