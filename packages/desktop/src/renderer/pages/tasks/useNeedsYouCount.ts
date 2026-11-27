/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ipcBridge } from '@/common';
import { columnsFromBoardResponse } from './boardModel';
import { needsYouCount } from './laneModel';

/** Refetch at most this often after `task.board.updated` pushes. */
const PUSH_DEBOUNCE_MS = 800;
/** Safety refresh when no push arrives (socket down, older core). */
const POLL_MS = 60_000;

/**
 * 3.0 U2: sider "Tasks" badge = tasks in the Needs-you lane. Core 0.6 has no
 * separate count endpoint, so this reads the board (lanes derived the same
 * way as the page). Cores without the board API give 0 (no badge).
 */
export const useNeedsYouCount = (enabled = true): number => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const board = ipcBridge.taskSession?.board;
    if (!board?.get?.invoke) return;
    const refresh = () => {
      Promise.resolve()
        .then(() => board.get.invoke({}))
        .then((response) => {
          if (!disposed) setCount(needsYouCount(columnsFromBoardResponse(response)));
        })
        .catch(() => {
          if (!disposed) setCount(0);
        });
    };
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    const off = board.updated?.on?.(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(refresh, PUSH_DEBOUNCE_MS);
    });
    return () => {
      disposed = true;
      clearInterval(poll);
      if (debounce) clearTimeout(debounce);
      off?.();
    };
  }, [enabled]);

  return count;
};
