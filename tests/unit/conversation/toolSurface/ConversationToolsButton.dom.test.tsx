/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IConversationCapabilities } from '@/common/adapter/ipcBridge';

type CapabilityEvent = { conversation_id: string; capabilities: IConversationCapabilities };

const bridge = vi.hoisted(() => ({
  listeners: [] as Array<(event: CapabilityEvent) => void>,
  invoke: vi.fn(),
  hasEndpoint: true,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    get conversation() {
      return bridge.hasEndpoint
        ? {
            getCapabilities: { invoke: bridge.invoke },
            capabilitiesChanged: {
              on: (listener: (event: CapabilityEvent) => void) => {
                bridge.listeners.push(listener);
                return () => {
                  bridge.listeners = bridge.listeners.filter((item) => item !== listener);
                };
              },
            },
          }
        : {};
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'servers' in options ? `${key}:${String(options.servers)}` : key,
  }),
}));

import ConversationToolsButton from '@/renderer/pages/conversation/components/ToolSurface/ConversationToolsButton';

const caps = (overrides: Partial<IConversationCapabilities> = {}): IConversationCapabilities => ({
  followup: true,
  steer: false,
  inject: false,
  tool_enforcement: 'native',
  ...overrides,
});

const openDrawer = async () => {
  const button = await screen.findByTestId('conversation-tools-button');
  fireEvent.click(button);
  return button;
};

describe('ConversationToolsButton', () => {
  beforeEach(() => {
    bridge.listeners = [];
    bridge.invoke.mockReset();
    bridge.hasEndpoint = true;
  });

  it('renders builtin / MCP-by-server / skill groups with server status', async () => {
    bridge.invoke.mockResolvedValue(
      caps({
        tool_surface: {
          source: 'claude_init',
          tools: ['Read', 'mcp__docs__search'],
          mcp_isolation: 'strict',
          entries: [
            { name: 'Read', canonical: 'Read', kind: 'builtin' },
            { name: 'mcp__docs__search', canonical: 'mcp__docs__search', kind: 'mcp', server: 'docs' },
            { name: 'pdf', canonical: 'skill:pdf', kind: 'skill' },
          ],
          mcp_servers: [
            { name: 'docs', status: 'connected' },
            { name: 'gone', status: 'missing: gone' },
            { name: 'broken', status: 'failed' },
          ],
        },
      })
    );
    render(<ConversationToolsButton conversationId='c1' />);
    await openDrawer();

    const builtin = await screen.findByTestId('tool-surface-builtin-tools');
    expect(builtin.textContent).toContain('Read');
    expect(screen.getByTestId('tool-surface-skill-tools').textContent).toContain('pdf');
    const servers = screen.getAllByTestId('tool-surface-mcp-server').map((node) => node.getAttribute('data-server'));
    expect(servers).toEqual(['broken', 'docs', 'gone']);
    const statuses = screen.getAllByTestId('tool-surface-mcp-status').map((node) => node.textContent);
    expect(statuses).toEqual([
      'conversation.toolSurface.status.failed',
      'conversation.toolSurface.status.ok',
      'conversation.toolSurface.status.missing',
    ]);
    expect(screen.queryByTestId('tool-surface-external-hint')).toBeNull();
    expect(screen.getByTestId('tool-surface-isolation').textContent).toBe('conversation.toolSurface.isolation.strict');
  });

  it('shows the yellow external-MCP hint when the core reports external servers', async () => {
    bridge.invoke.mockResolvedValue(
      caps({
        tool_surface: {
          source: 'codex_mcp_status',
          tools: ['mcp__home__lights'],
          mcp_isolation: 'ambient',
          mcp_servers: [{ name: 'home', status: 'connected', external: true }],
          external_mcp_servers: ['home'],
        },
      })
    );
    render(<ConversationToolsButton conversationId='c1' />);
    const button = await openDrawer();
    expect(button.getAttribute('data-external')).toBe('true');

    const hint = await screen.findByTestId('tool-surface-external-hint');
    expect(hint.textContent).toContain('conversation.toolSurface.externalHint:home');
    expect(screen.getByTestId('tool-surface-mcp-external')).toBeTruthy();
  });

  it('updates from capabilitiesChanged pushes for the same conversation only', async () => {
    bridge.invoke.mockResolvedValue(caps());
    render(<ConversationToolsButton conversationId='c1' />);
    await openDrawer();
    expect(await screen.findByTestId('tool-surface-not-reported')).toBeTruthy();

    const reported = caps({
      tool_surface: {
        source: 'aionrs_registry',
        tools: ['Read'],
        mcp_isolation: 'strict',
        tool_search_inert: true,
      },
    });
    act(() => {
      bridge.listeners.forEach((listener) => listener({ conversation_id: 'other', capabilities: reported }));
    });
    expect(screen.queryByTestId('tool-surface-panel')).toBeNull();
    act(() => {
      bridge.listeners.forEach((listener) => listener({ conversation_id: 'c1', capabilities: reported }));
    });
    expect(await screen.findByTestId('tool-surface-panel')).toBeTruthy();
    expect(screen.getByTestId('tool-surface-toolsearch-inert')).toBeTruthy();
  });

  it('marks a launch-config surface as not reporting its loaded tools (generic ACP / Antigravity)', async () => {
    bridge.invoke.mockResolvedValue(
      caps({
        tool_surface: {
          source: 'launch_config',
          tools: [],
          mcp_servers: [{ name: 'docs', external: false }],
          mcp_isolation: 'ambient',
          mcp_discovery: 'unavailable',
        },
      })
    );
    render(<ConversationToolsButton conversationId='c1' />);
    await openDrawer();
    expect(await screen.findByTestId('tool-surface-discovery-unavailable')).toBeTruthy();
    expect(screen.queryByText('conversation.toolSurface.total')).toBeNull();
    expect(screen.getByTestId('tool-surface-isolation').textContent).toBe('conversation.toolSurface.isolation.ambient');
    expect(screen.queryByTestId('tool-surface-external-hint')).toBeNull();
    const server = screen.getByTestId('tool-surface-mcp-server');
    expect(server.getAttribute('data-server')).toBe('docs');
  });

  it('keeps the count and omits the discovery note when the backend reports what it loaded', async () => {
    bridge.invoke.mockResolvedValue(
      caps({ tool_surface: { source: 'codex_mcp_status', tools: ['shell'], mcp_isolation: 'ambient' } })
    );
    render(<ConversationToolsButton conversationId='c1' />);
    await openDrawer();
    expect(await screen.findByTestId('tool-surface-panel')).toBeTruthy();
    expect(screen.queryByTestId('tool-surface-discovery-unavailable')).toBeNull();
    expect(screen.getByText('conversation.toolSurface.total')).toBeTruthy();
  });

  it('degrades to "not reported" when an older core omits tool_surface', async () => {
    bridge.invoke.mockResolvedValue(caps());
    render(<ConversationToolsButton conversationId='c1' />);
    await openDrawer();
    const empty = await screen.findByTestId('tool-surface-not-reported');
    expect(empty.textContent).toContain('conversation.toolSurface.notReported');
    expect(screen.queryByTestId('tool-surface-panel')).toBeNull();
  });

  it('hides the entry when the capability endpoint is missing or fails', async () => {
    bridge.hasEndpoint = false;
    const { unmount } = render(<ConversationToolsButton conversationId='c1' />);
    expect(screen.queryByTestId('conversation-tools-button')).toBeNull();
    unmount();

    bridge.hasEndpoint = true;
    bridge.invoke.mockRejectedValue(new Error('404'));
    render(<ConversationToolsButton conversationId='c2' />);
    await waitFor(() => expect(bridge.invoke).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId('conversation-tools-button')).toBeNull();
  });
});
