/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import SiderFooter from '@/renderer/components/layout/Sider/SiderFooter';

afterEach(cleanup);

const base = {
  isMobile: false,
  theme: 'light',
  siderTooltipProps: { disabled: true } as never,
  onSettingsClick: vi.fn(),
  onThemeToggle: vi.fn(),
};

describe('SiderFooter', () => {
  it('keeps only Back labelled inside Settings so nothing is cut off', () => {
    const onLogout = vi.fn();
    render(<SiderFooter {...base} isSettings showLogout onLogoutClick={onLogout} />);
    expect(screen.getByText('common.back')).toBeTruthy();
    expect(screen.queryByText('settings.googleLogout')).toBeNull();
    const logout = screen.getByTestId('sider-logout');
    expect(logout.getAttribute('aria-label')).toBe('settings.googleLogout');
    fireEvent.click(logout);
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('theme-toggle')).toBeTruthy();
  });

  it('shows the Logout label outside Settings', () => {
    render(<SiderFooter {...base} isSettings={false} showLogout onLogoutClick={vi.fn()} />);
    expect(screen.getByText('settings.googleLogout')).toBeTruthy();
    expect(screen.getByText('common.settings')).toBeTruthy();
  });
});
