/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { desktop, config } = vi.hoisted(() => ({
  desktop: { current: true },
  config: {
    values: new Map<string, unknown>(),
    set: vi.fn(async () => undefined),
    setLocal: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => desktop.current,
  isMacOS: () => false,
}));
vi.mock('@renderer/utils/platform', () => ({
  isElectronDesktop: () => desktop.current,
  isMacOS: () => false,
}));
vi.mock('@/common/config/configService', () => ({
  configService: {
    get: (key: string) => config.values.get(key),
    set: config.set,
    setLocal: config.setLocal,
  },
}));

import { NotificationsSettingsContent } from '@/renderer/pages/settings/NotificationsSettings';
import { ShortcutsSettingsContent } from '@/renderer/pages/settings/ShortcutsSettings';
import { SHORTCUTS } from '@/renderer/pages/settings/ShortcutsSettings/shortcuts';

beforeEach(() => {
  config.values.clear();
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
  vi.clearAllMocks();
  desktop.current = true;
});

describe('Notifications page (3.0 V7)', () => {
  it('reads and writes the same system.* config keys', () => {
    config.values.set('system.notificationEnabled', true);
    config.values.set('system.cronNotificationEnabled', false);
    render(<NotificationsSettingsContent />);
    expect(screen.getByText('settings.notificationsPage.title')).toBeTruthy();
    const cron = screen.getByTestId('cron-notification-switch');
    fireEvent.click(cron);
    expect(config.set).toHaveBeenCalledWith('system.cronNotificationEnabled', true);
    fireEvent.click(screen.getByTestId('notification-enabled-switch'));
    expect(config.set).toHaveBeenCalledWith('system.notificationEnabled', false);
  });
});

describe('Keyboard shortcuts page (3.0 V7)', () => {
  it('lists every shortcut with platform key hints', () => {
    render(<ShortcutsSettingsContent />);
    expect(screen.getAllByTestId('shortcut-row')).toHaveLength(SHORTCUTS.length);
    const palette = document.querySelector("[data-shortcut='commandPalette']")!;
    expect(palette.querySelector('kbd')?.textContent).toBe('Ctrl+K');
    expect(palette.querySelector('kbd')?.getAttribute('dir')).toBe('ltr');
    expect(screen.queryByTestId('shortcut-desktop-only')).toBeNull();
    expect(screen.getByText('settings.shortcutsPage.readOnlyNote')).toBeTruthy();
  });

  it('marks desktop-only shortcuts in WebUI', () => {
    desktop.current = false;
    render(<ShortcutsSettingsContent />);
    expect(screen.getAllByTestId('shortcut-desktop-only')).toHaveLength(SHORTCUTS.filter((e) => e.desktopOnly).length);
  });
});
