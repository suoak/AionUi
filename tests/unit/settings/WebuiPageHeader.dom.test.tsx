/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const viewMode = vi.hoisted(() => ({ current: 'page' as 'page' | 'modal', desktop: true }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('@/common/adapter/ipcBridge', () => {
  const channel = () => ({ invoke: vi.fn(async () => null), on: vi.fn(() => () => {}) });
  const group = () => new Proxy({}, { get: () => channel() });
  return { webui: group(), shell: group() };
});
vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn(() => undefined),
    set: vi.fn(async () => undefined),
    whenReady: vi.fn(async () => undefined),
  },
}));
vi.mock('@/renderer/components/base/WorkMateModal', () => ({ default: () => null }));
vi.mock('@/renderer/hooks/assistant/useTalkToButler', () => ({ useTalkToButler: () => vi.fn() }));
vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: () => viewMode.desktop }));
vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => viewMode.current,
}));
vi.mock('@/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent', () => ({
  default: () => <div data-testid='channels-content' />,
}));

import WebuiModalContent from '@/renderer/components/settings/SettingsModal/contents/WebuiModalContent';

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

afterEach(() => {
  cleanup();
  viewMode.current = 'page';
  viewMode.desktop = true;
});

describe('Remote (WebUI) settings uses the shared page header (3.0 V7)', () => {
  it('page mode shows the shared header with the Remote title and description', () => {
    render(<WebuiModalContent />);
    const header = screen.getByTestId('settings-page-header-webui');
    expect(header.querySelector('h1')?.textContent).toBe('settings.webui');
    expect(header.textContent).toContain('settings.webui.description');
    // The description is shown once, in the header, not again in the panel.
    expect(screen.getAllByText('settings.webui.description')).toHaveLength(1);
    expect(screen.queryByRole('heading', { level: 2, name: 'WebUI' })).toBeNull();
  });

  it('modal mode keeps the original title and description and no page header', () => {
    viewMode.current = 'modal';
    render(<WebuiModalContent />);
    expect(screen.queryByTestId('settings-page-header-webui')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'WebUI' })).toBeTruthy();
    expect(screen.getByText('settings.webui.description')).toBeTruthy();
  });

  it('browser page mode titles the Channels-only view with the shared header', () => {
    viewMode.desktop = false;
    render(<WebuiModalContent />);
    expect(screen.getByTestId('settings-page-header-webui').querySelector('h1')?.textContent).toBe('settings.channels');
  });
});
