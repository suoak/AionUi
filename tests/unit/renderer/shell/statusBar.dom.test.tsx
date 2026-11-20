/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  desktop: true,
  remote: { mode: 'local', port: 0 } as { mode: 'local' | 'remote'; port: number; baseUrl?: string },
  runs: { working: 0, needsYou: 0, firstNeedsYouId: null as string | null },
  events: [] as unknown[],
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${Object.values(options).map(String).join(',')}` : key,
    i18n: { language: 'en-US' },
  }),
}));
vi.mock('@/common/adapter/ipcBridge', () => ({
  remoteBackend: { getStatus: { invoke: () => Promise.resolve(mocks.remote) } },
}));
vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: () => mocks.desktop, isMacOS: () => true }));
vi.mock('@/renderer/hooks/chat/useTokenUsageStats', () => ({ useTokenUsageStats: () => ({ events: mocks.events }) }));
vi.mock('@/renderer/utils/chat/tokenUsageAggregate', () => ({
  filterUsageToday: (events: unknown[]) => events,
  summarizeUsageEvents: () => ({ total_tokens: 1234 }),
}));
vi.mock('@/renderer/components/agent/ContextUsageIndicator', () => ({
  formatTokenCount: (n: number) => `${n}tok`,
}));
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync', () => ({
  useConversationRunCounts: () => mocks.runs,
}));

import StatusBar from '@/renderer/components/layout/StatusBar';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/renderer/components/command-palette/useCommandPalette';
import { setUpdateReadyState } from '@/renderer/components/settings/updateReadyState';

describe('StatusBar (V3)', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.desktop = true;
    mocks.remote = { mode: 'local', port: 0 };
    mocks.runs = { working: 0, needsYou: 0, firstNeedsYouId: null };
    setUpdateReadyState({ ready: false, version: '' });
  });
  afterEach(cleanup);

  it('shows the local host, an idle run count and today usage', async () => {
    render(<StatusBar />);
    expect(await screen.findByText('common.statusBar.hostLocal')).toBeTruthy();
    expect(screen.getByTestId('status-bar-working').textContent).toContain('common.statusBar.working:0');
    expect(screen.getByTestId('status-bar-working').querySelector('[data-status]')).toHaveAttribute(
      'data-status',
      'idle'
    );
    expect(screen.getByTestId('status-bar-usage').textContent).toContain('1234tok');
    expect(screen.queryByTestId('status-bar-needs-you')).toBeNull();
    expect(screen.queryByTestId('status-bar-update')).toBeNull();
  });

  it('names a remote host', async () => {
    mocks.remote = { mode: 'remote', port: 1, baseUrl: 'http://10.0.0.2:25808' };
    render(<StatusBar />);
    expect(await screen.findByText('common.statusBar.hostRemote:10.0.0.2:25808')).toBeTruthy();
  });

  it('hides the host cell in WebUI', () => {
    mocks.desktop = false;
    render(<StatusBar />);
    expect(screen.queryByTestId('status-bar-host')).toBeNull();
  });

  it('jumps to the conversation that needs you', () => {
    mocks.runs = { working: 2, needsYou: 1, firstNeedsYouId: 'c9' };
    render(<StatusBar />);
    expect(screen.getByTestId('status-bar-working').querySelector('[data-status]')).toHaveAttribute(
      'data-status',
      'working'
    );
    fireEvent.click(screen.getByTestId('status-bar-needs-you'));
    expect(mocks.navigate).toHaveBeenCalledWith('/conversation/c9');
  });

  it('links usage, update and the command palette', async () => {
    const onOpen = vi.fn();
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    render(<StatusBar />);
    fireEvent.click(screen.getByTestId('status-bar-usage'));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/usage');
    act(() => setUpdateReadyState({ ready: true, version: '3.0.1' }));
    await waitFor(() => expect(screen.getByTestId('status-bar-update')).toBeTruthy());
    fireEvent.click(screen.getByTestId('status-bar-update'));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/about');
    fireEvent.click(screen.getByTestId('status-bar-command-palette'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
  });
});
