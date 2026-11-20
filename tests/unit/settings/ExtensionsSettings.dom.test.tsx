/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const api = vi.hoisted(() => ({
  getLoadedExtensions: vi.fn(),
  getSettingsTabs: vi.fn(),
  getCommands: vi.fn(),
  getPanels: vi.fn(),
  getWorkPanelViews: vi.fn(),
  enableExtension: vi.fn(),
  disableExtension: vi.fn(),
  getPermissions: vi.fn(),
  off: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && Object.keys(options).length > 0 ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));
vi.mock('@/common', () => {
  return {
    ipcBridge: {
      extensions: {
        getLoadedExtensions: { invoke: api.getLoadedExtensions },
        getSettingsTabs: { invoke: api.getSettingsTabs },
        getCommands: { invoke: api.getCommands },
        getPanels: { invoke: api.getPanels },
        getWorkPanelViews: { invoke: api.getWorkPanelViews },
        enableExtension: { invoke: api.enableExtension },
        disableExtension: { invoke: api.disableExtension },
        getPermissions: { invoke: api.getPermissions },
        stateChanged: { on: () => api.off },
      },
    },
  };
});
vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return { ...actual, Message: { ...actual.Message, success: api.toast } };
});

import { ExtensionsSettingsContent } from '@/renderer/pages/settings/ExtensionsSettings';

const EXTENSIONS = [
  { name: 'jira-bridge', display_name: 'Jira Bridge', version: '1.2.0', source: 'appdata', enabled: true },
  { name: 'old-tool', display_name: '', version: '0.1.0', source: 'hub', enabled: false, description: 'Legacy' },
];

beforeEach(() => {
  api.getLoadedExtensions.mockResolvedValue(EXTENSIONS);
  api.getSettingsTabs.mockResolvedValue([{ extensionName: 'jira-bridge' }]);
  api.getCommands.mockResolvedValue([{ extensionName: 'jira-bridge' }, { extensionName: 'jira-bridge' }]);
  api.getPanels.mockRejectedValue(new Error('boom'));
  api.getWorkPanelViews.mockResolvedValue([]);
  api.enableExtension.mockResolvedValue(undefined);
  api.disableExtension.mockResolvedValue(undefined);
  api.getPermissions.mockResolvedValue({
    permissions: {},
    risk_level: 'dangerous',
    details: [{ permission: 'shell', level: 'full', description: 'Run commands' }],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const card = (name: string) => document.querySelector(`[data-extension='${name}']`) as HTMLElement;

describe('Installed extensions page (3.0 V7)', () => {
  it('lists extensions with version, source and contribution counts', async () => {
    render(<ExtensionsSettingsContent />);
    await waitFor(() => expect(screen.getAllByTestId('extension-card')).toHaveLength(2));
    const jira = within(card('jira-bridge'));
    expect(jira.getByText('Jira Bridge')).toBeTruthy();
    expect(jira.getByText('settings.extensionsPage.version:{"version":"1.2.0"}')).toBeTruthy();
    expect(jira.getByTestId('extension-source').textContent).toBe('settings.extensionsPage.source.appdata');
    await waitFor(() =>
      expect(jira.getByTestId('extension-contributions').textContent).toContain(
        'settings.extensionsPage.contributions.commands:{"count":2}'
      )
    );
    expect(jira.getByTestId('extension-contributions').textContent).toContain(
      'settings.extensionsPage.contributions.settingsTabs:{"count":1}'
    );
    const old = within(card('old-tool'));
    expect(old.getByTestId('extension-source').textContent).toBe(
      'settings.extensionsPage.source.other:{"source":"hub"}'
    );
    expect(old.getByTestId('extension-contributions').textContent).toBe(
      'settings.extensionsPage.contributions.hiddenWhileOff'
    );
  });

  it('turns an extension off and shows a reason-coded refusal inline', async () => {
    render(<ExtensionsSettingsContent />);
    await waitFor(() => expect(card('jira-bridge')).toBeTruthy());
    fireEvent.click(within(card('jira-bridge')).getByTestId('extension-toggle'));
    await waitFor(() => expect(api.disableExtension).toHaveBeenCalledWith({ name: 'jira-bridge' }));
    expect(api.getLoadedExtensions).toHaveBeenCalledTimes(2);
    expect(api.toast).toHaveBeenCalledWith('settings.extensionsPage.disabledToast:{"name":"Jira Bridge"}');

    api.enableExtension.mockRejectedValueOnce(new Error('ext_signature_invalid: refused'));
    fireEvent.click(within(card('old-tool')).getByTestId('extension-toggle'));
    await waitFor(() => expect(within(card('old-tool')).getByTestId('extension-toggle-error')).toBeTruthy());
    expect(api.enableExtension).toHaveBeenCalledWith({ name: 'old-tool' });
  });

  it('loads permissions on demand and shows the risk level', async () => {
    render(<ExtensionsSettingsContent />);
    await waitFor(() => expect(card('jira-bridge')).toBeTruthy());
    const jira = within(card('jira-bridge'));
    expect(api.getPermissions).not.toHaveBeenCalled();
    fireEvent.click(jira.getByTestId('extension-permissions-toggle'));
    await waitFor(() => expect(jira.getByText('shell')).toBeTruthy());
    expect(api.getPermissions).toHaveBeenCalledWith({ name: 'jira-bridge' });
    expect(jira.getByTestId('extension-risk').textContent).toBe('settings.extensionsPage.risk.dangerous');
    expect(jira.getByText('settings.extensionsPage.permissions.level.full')).toBeTruthy();
  });

  it('filters, and shows empty and load-error states', async () => {
    render(<ExtensionsSettingsContent />);
    await waitFor(() => expect(screen.getAllByTestId('extension-card')).toHaveLength(2));
    const search =
      screen.getByTestId('extensions-search').querySelector('input') ?? screen.getByTestId('extensions-search');
    fireEvent.change(search, { target: { value: 'legacy' } });
    expect(screen.getAllByTestId('extension-card')).toHaveLength(1);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByTestId('extensions-no-match')).toBeTruthy();
    cleanup();

    api.getLoadedExtensions.mockResolvedValueOnce([]);
    render(<ExtensionsSettingsContent />);
    await waitFor(() => expect(screen.getByTestId('extensions-empty')).toBeTruthy());
    cleanup();

    api.getLoadedExtensions.mockRejectedValueOnce(new Error('offline'));
    render(<ExtensionsSettingsContent />);
    await waitFor(() => expect(screen.getByTestId('extensions-load-error')).toBeTruthy());
  });
});
