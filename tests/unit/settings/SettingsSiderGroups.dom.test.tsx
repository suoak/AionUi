/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const { extensionTabs } = vi.hoisted(() => ({ extensionTabs: { current: [] as unknown[] } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k }),
}));
vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  resolveExtensionAssetUrl: () => undefined,
}));
vi.mock('@/renderer/hooks/system/useExtensionSettingsTabs', () => ({
  useExtensionSettingsTabs: () => extensionTabs.current,
}));
vi.mock('@/renderer/hooks/system/useExtI18n', () => ({
  useExtI18n: () => ({ resolveExtTabName: (tab: { name: string }) => tab.name }),
}));

import SettingsSider from '@/renderer/pages/settings/components/SettingsSider';

const Where = () => <div data-testid='where'>{useLocation().pathname}</div>;

const renderSider = (collapsed = false) =>
  render(
    <MemoryRouter initialEntries={['/settings/model']}>
      <Routes>
        <Route
          path='*'
          element={
            <>
              <SettingsSider collapsed={collapsed} />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );

const headers = () =>
  Array.from(document.querySelectorAll('[data-settings-group]')).map((el) => el.getAttribute('data-settings-group'));
const rows = () =>
  Array.from(document.querySelectorAll('[data-settings-id]')).map((el) => el.getAttribute('data-settings-id'));

afterEach(() => {
  cleanup();
  extensionTabs.current = [];
});

describe('SettingsSider groups and search (3.0 V7)', () => {
  it('shows the six groups in order; Installed extensions leads the Extensions group', () => {
    renderSider();
    expect(headers()).toEqual(['general', 'runtime', 'workspace', 'extensions', 'team', 'about']);
    expect(rows().indexOf('extensions')).toBe(rows().indexOf('governance') - 1);
    cleanup();
    extensionTabs.current = [{ id: 'ext-a', name: 'Ext A' }];
    renderSider();
    expect(headers()).toEqual(['general', 'runtime', 'workspace', 'extensions', 'team', 'about']);
    expect(rows().indexOf('ext-a')).toBe(rows().indexOf('extensions') + 1);
    expect(rows().indexOf('ext-a')).toBe(rows().indexOf('governance') - 1);
    expect(screen.getByText('settings.groups.extensions')).toBeTruthy();
  });

  it('filters rows, shows an empty state and opens the first match on Enter', () => {
    renderSider();
    const search =
      screen.getByTestId('settings-search').querySelector('input') ?? screen.getByTestId('settings-search');
    fireEvent.change(search, { target: { value: 'mcp' } });
    expect(rows()).toEqual(['tools']);
    expect(headers()).toEqual(['runtime']);
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByTestId('where').textContent).toBe('/settings/tools');

    fireEvent.change(search, { target: { value: 'zzz-no-match' } });
    expect(rows()).toEqual([]);
    expect(screen.getByTestId('settings-search-empty')).toBeTruthy();

    fireEvent.keyDown(search, { key: 'Escape' });
    expect(rows().length).toBeGreaterThan(10);
  });

  it('collapsed: no search box and no headers, all rows', () => {
    renderSider(true);
    expect(screen.queryByTestId('settings-search')).toBeNull();
    expect(headers()).toEqual([]);
    expect(rows()).toContain('about');
  });
});
