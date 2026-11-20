/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { desktop } = vi.hoisted(() => ({ desktop: { current: true } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => desktop.current,
}));
vi.mock('@/common/adapter/ipcBridge', () => ({
  sshTunnel: {
    getStatus: { invoke: vi.fn(async () => ({ running: false })) },
    start: { invoke: vi.fn() },
    stop: { invoke: vi.fn() },
  },
  remoteBackend: {
    getStatus: { invoke: vi.fn(async () => ({ mode: 'local', port: 0 })) },
    connect: { invoke: vi.fn() },
    disconnect: { invoke: vi.fn() },
  },
}));

import { RemoteHostSettingsContent } from '@/renderer/pages/settings/RemoteHostSettings';

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  desktop.current = true;
});

describe('Remote Host settings page (3.0 V7)', () => {
  it('shows the page header once and the SSH form without its section heading', () => {
    render(<RemoteHostSettingsContent />);
    expect(screen.getAllByText('settings.remoteHost.title')).toHaveLength(1);
    expect(screen.getAllByText('settings.remoteHost.description')).toHaveLength(1);
    expect(screen.getByTestId('remote-host-ssh-section')).toBeTruthy();
    expect(screen.getByTestId('ssh-tunnel-remote')).toBeTruthy();
  });

  it('stays desktop-only outside Electron', () => {
    desktop.current = false;
    render(<RemoteHostSettingsContent />);
    expect(screen.getByText('settings.remoteHost.desktopOnly')).toBeTruthy();
    expect(screen.queryByTestId('ssh-tunnel-remote')).toBeNull();
    expect(screen.getAllByText('settings.remoteHost.title')).toHaveLength(1);
  });
});
