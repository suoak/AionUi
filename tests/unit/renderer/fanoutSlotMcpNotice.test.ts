/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import type { IConversationToolSurface } from '@/common/adapter/ipcBridge';
import { slotMcpNotice } from '@/renderer/pages/conversation/fanout/FanoutSlotMcpNotice';

const surface = (patch: Partial<IConversationToolSurface>): IConversationToolSurface =>
  ({ mcp_isolation: 'strict', ...patch }) as IConversationToolSurface;

describe('slotMcpNotice (E3-5 external MCP notice)', () => {
  it('stays quiet until the slot reports a tool surface', () => {
    expect(slotMcpNotice(undefined)).toBeNull();
  });

  it('stays quiet for a strict surface with no external servers', () => {
    expect(slotMcpNotice(surface({ external_mcp_servers: [] }))).toBeNull();
  });

  it('names the external servers the backend reported', () => {
    expect(slotMcpNotice(surface({ mcp_isolation: 'ambient', external_mcp_servers: ['github', 'fs'] }))).toEqual({
      kind: 'external',
      servers: ['github', 'fs'],
    });
  });

  it('flags an ambient surface whose external servers are unknown', () => {
    expect(slotMcpNotice(surface({ mcp_isolation: 'ambient' }))).toEqual({ kind: 'unknown' });
  });
});
