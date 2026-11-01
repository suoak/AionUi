/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  desktop: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: { application: { getEncryptionRootStatus: { invoke: mocks.status } } },
}));

vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: mocks.desktop }));

vi.mock('react-i18next', () => {
  const value = { t: (key: string) => key, i18n: { language: 'en-US' } };
  return { useTranslation: () => value };
});

import EncryptionRootHint from '@/renderer/pages/settings/GovernanceSettings/EncryptionRootHint';

describe('EncryptionRootHint', () => {
  beforeEach(() => {
    mocks.desktop.mockReturnValue(true);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the keychain state on desktop', async () => {
    mocks.status.mockResolvedValue({ state: 'keychain', checkedAt: 1 });
    render(<EncryptionRootHint />);
    const alert = await screen.findByTestId('governance-encryption-root');
    expect(alert.getAttribute('data-state')).toBe('keychain');
    expect(alert.textContent).toContain('settings.governance.encryptionRoot.title');
    expect(alert.textContent).toContain('settings.governance.encryptionRoot.keychain');
  });

  it('shows the stale-copy note when a copy was set aside', async () => {
    mocks.status.mockResolvedValue({ state: 'migrated', checkedAt: 1, replacedStaleCopy: true });
    render(<EncryptionRootHint />);
    const alert = await screen.findByTestId('governance-encryption-root');
    expect(alert.textContent).toContain('settings.governance.encryptionRoot.staleReplaced');
  });

  it('warns when the keychain is unavailable', async () => {
    mocks.status.mockResolvedValue({ state: 'unavailable', checkedAt: 1, storageBackend: 'basic_text' });
    render(<EncryptionRootHint />);
    const alert = await screen.findByTestId('governance-encryption-root');
    expect(alert.textContent).toContain('settings.governance.encryptionRoot.unavailable');
  });

  it('renders nothing for unknown state or a failed call', async () => {
    mocks.status.mockResolvedValueOnce({ state: 'unknown', checkedAt: 1 });
    const { unmount } = render(<EncryptionRootHint />);
    await waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('governance-encryption-root')).toBeNull();
    unmount();

    mocks.status.mockRejectedValueOnce(new Error('no provider'));
    render(<EncryptionRootHint />);
    await waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('governance-encryption-root')).toBeNull();
  });

  it('does not call the desktop bridge in the browser WebUI', () => {
    mocks.desktop.mockReturnValue(false);
    render(<EncryptionRootHint />);
    expect(mocks.status).not.toHaveBeenCalled();
    expect(screen.queryByTestId('governance-encryption-root')).toBeNull();
  });
});
