/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent', () => ({
  default: () => <div data-testid='system-content' />,
}));
vi.mock('@/renderer/components/settings/SettingsModal/contents/AboutModalContent', () => ({
  default: () => <div data-testid='about-content' />,
}));
vi.mock('@/renderer/components/settings/SettingsModal/contents/AppearanceModalContent', () => ({
  default: () => <div data-testid='appearance-content' />,
}));

import SystemSettings from '@/renderer/pages/settings/SystemSettings';
import AppearanceSettings from '@/renderer/pages/settings/AppearanceSettings';

afterEach(cleanup);

const at = (path: string, node: React.ReactNode) => render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);

describe('Legacy settings pages use the shared page header (3.0 V7)', () => {
  it('System shows the header above its content', () => {
    at('/settings/system', <SystemSettings />);
    expect(screen.getByTestId('settings-page-header-system').textContent).toContain('settings.pageIntro.system');
    expect(screen.getByTestId('system-content')).toBeTruthy();
  });

  it('About keeps its own hero and gets no extra header', () => {
    at('/settings/about', <SystemSettings />);
    expect(screen.queryByTestId('settings-page-header-system')).toBeNull();
    expect(screen.getByTestId('about-content')).toBeTruthy();
  });

  it('Appearance shows the header above its content', () => {
    at('/settings/appearance', <AppearanceSettings />);
    expect(screen.getByTestId('settings-page-header-appearance').textContent).toContain(
      'settings.pageIntro.appearance'
    );
    expect(screen.getByTestId('appearance-content')).toBeTruthy();
  });
});
