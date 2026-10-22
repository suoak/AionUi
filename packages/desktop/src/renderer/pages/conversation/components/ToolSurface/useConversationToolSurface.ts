/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConversationToolSurface } from '@/common/adapter/ipcBridge';
import { useEffect, useState } from 'react';

export type ConversationToolSurfaceState =
  /** No capability endpoint, or it failed: hide the entry point. */
  | { status: 'unavailable' }
  | { status: 'loading' }
  /** Capabilities answered without `tool_surface` (older Core / not reported yet). */
  | { status: 'not_reported' }
  | { status: 'reported'; surface: IConversationToolSurface };

const fromCapabilities = (surface: IConversationToolSurface | undefined): ConversationToolSurfaceState =>
  surface ? { status: 'reported', surface } : { status: 'not_reported' };

/**
 * Read-only view of the tool surface the running agent reported, from the
 * existing capabilities endpoint plus `capabilitiesChanged` pushes.
 */
export const useConversationToolSurface = (conversation_id: string): ConversationToolSurfaceState => {
  const [state, setState] = useState<ConversationToolSurfaceState>(() =>
    ipcBridge.conversation?.getCapabilities ? { status: 'loading' } : { status: 'unavailable' }
  );

  useEffect(() => {
    const getCapabilities = ipcBridge.conversation?.getCapabilities;
    if (!getCapabilities) {
      setState({ status: 'unavailable' });
      return;
    }
    setState({ status: 'loading' });
    let active = true;
    void getCapabilities
      .invoke({ conversation_id })
      .then((next) => {
        if (active) setState(next ? fromCapabilities(next.tool_surface) : { status: 'unavailable' });
      })
      .catch(() => {
        if (active) setState({ status: 'unavailable' });
      });
    return () => {
      active = false;
    };
  }, [conversation_id]);

  useEffect(() => {
    if (!ipcBridge.conversation?.capabilitiesChanged?.on) return;
    return ipcBridge.conversation.capabilitiesChanged.on((event) => {
      if (event.conversation_id !== conversation_id) return;
      setState(fromCapabilities(event.capabilities.tool_surface));
    });
  }, [conversation_id]);

  return state;
};
