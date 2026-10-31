/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import { BackendHttpError } from '@/common/adapter/httpBridge';

const mocks = vi.hoisted(() => {
  const pairingListeners: Array<(event: unknown) => void> = [];
  return {
    pairingListeners,
    list: vi.fn(),
    rename: vi.fn(),
    revoke: vi.fn(),
    setPush: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    reject: vi.fn(),
    webuiStatus: vi.fn(),
    sessions: vi.fn(),
    users: vi.fn(),
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    device: {
      list: { invoke: mocks.list },
      rename: { invoke: mocks.rename },
      revoke: { invoke: mocks.revoke },
      setPush: { invoke: mocks.setPush },
      pairing: {
        create: { invoke: mocks.create },
        get: { invoke: mocks.get },
        reject: { invoke: mocks.reject },
        changed: {
          on: (cb: (event: unknown) => void) => {
            mocks.pairingListeners.push(cb);
            return () => {
              const i = mocks.pairingListeners.indexOf(cb);
              if (i >= 0) mocks.pairingListeners.splice(i, 1);
            };
          },
        },
      },
    },
    webui: { getStatus: { invoke: mocks.webuiStatus } },
    channel: {
      getActiveSessions: { invoke: mocks.sessions },
      getAuthorizedUsers: { invoke: mocks.users },
    },
  },
}));

vi.mock('react-i18next', () => {
  // Stable like the real i18next `t`.
  const t = (key: string, options?: Record<string, unknown>) => {
    if (!options) return key;
    const { defaultValue: _d, ...rest } = options;
    return Object.keys(rest).length ? `${key}:${JSON.stringify(rest)}` : key;
  };
  const value = { t, i18n: { language: 'en-US' } };
  return { useTranslation: () => value };
});

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid='qr-svg' data-value={value} />,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { DevicesSettingsContent } from '@/renderer/pages/settings/DevicesSettings';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const now = () => NOW;

const device = (over: Record<string, unknown> = {}) => ({
  id: 'dev_1',
  name: 'Lian iPhone',
  platform: 'ios',
  scopes: ['approvals'],
  push_kind: 'none',
  push_target: null,
  last_seen_at: NOW - DAY,
  created_at: NOW - 40 * DAY,
  ...over,
});

const offer = { offer_id: 'offer_1', qr_token: 'qr-secret', code: '482913', expires_at: NOW + 5 * 60 * 1000 };

const emitPairing = (payload: unknown) => act(() => mocks.pairingListeners.forEach((l) => l(payload)));

const renderPage = (pollIntervalMs = 60_000) =>
  render(<DevicesSettingsContent now={now} pollIntervalMs={pollIntervalMs} />);

describe('DevicesSettings', () => {
  beforeEach(() => {
    mocks.pairingListeners.length = 0;
    for (const fn of Object.values(mocks)) if (typeof fn === 'function' && 'mockReset' in fn) fn.mockReset();
    mocks.list.mockResolvedValue([
      device(),
      device({ id: 'dev_2', name: 'Old Pixel', platform: 'android', last_seen_at: NOW - 85 * DAY }),
    ]);
    mocks.webuiStatus.mockResolvedValue({
      running: true,
      port: 25808,
      allowRemote: true,
      localUrl: 'http://localhost:25808',
      networkUrl: 'http://10.0.0.5:25808',
    });
    mocks.sessions.mockResolvedValue([
      { id: 'sess_tg', user_id: 'u_tg', agent_type: 'telegram', chatId: '42', lastActivity: 5 },
    ]);
    mocks.users.mockResolvedValue([{ id: 'u_tg', platformType: 'telegram', display_name: 'Lian' }]);
    vi.spyOn(Message, 'success').mockImplementation(() => () => {});
    vi.spyOn(Message, 'error').mockImplementation(() => () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists devices with last use, idle hints and the 5-device count', async () => {
    renderPage();
    const rows = await screen.findAllByTestId('device-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByTestId('device-count')).toHaveTextContent('settings.devices.count:{"count":2,"max":5}');
    expect(within(rows[0]).queryByTestId('device-idle')).toBeNull();
    expect(within(rows[0]).getByTestId('device-last-active').textContent).toContain('settings.devices.lastUsed');
    expect(within(rows[1]).getByTestId('device-idle')).toHaveAttribute('data-level', 'expiring');
    expect(within(rows[1]).getByTestId('device-expiring-hint')).toHaveTextContent('{"days":5}');
  });

  it('pairs a phone: shows QR + code, follows device.pairing and reloads the list', async () => {
    mocks.create.mockResolvedValue(offer);
    renderPage();
    await screen.findAllByTestId('device-row');
    fireEvent.click(screen.getByTestId('device-pair-start'));
    expect(await screen.findByTestId('device-pair-code')).toHaveTextContent('482913');
    const qr = await screen.findByTestId('qr-svg');
    expect(qr.getAttribute('data-value')).toBe('http://10.0.0.5:25808/pair-device?token=qr-secret');
    expect(qr.getAttribute('data-value')).not.toContain('482913');
    expect(screen.queryByTestId('device-pair-reach-hint')).toBeNull();

    // Events for other offers are ignored.
    emitPairing({ offer_id: 'other', status: 'paired', expires_at: offer.expires_at });
    expect(screen.getByTestId('device-pair-status')).toHaveTextContent('settings.devices.pair.status.waiting');

    emitPairing({
      offer_id: 'offer_1',
      status: 'requested',
      device_name: 'New iPhone',
      platform: 'ios',
      expires_at: offer.expires_at,
    });
    expect(screen.getByTestId('device-pair-status')).toHaveTextContent('"name":"New iPhone"');
    expect(screen.getByTestId('device-pair-reject')).toBeInTheDocument();

    emitPairing({
      offer_id: 'offer_1',
      status: 'paired',
      device_name: 'New iPhone',
      device_id: 'dev_3',
      expires_at: offer.expires_at,
    });
    expect(await screen.findByTestId('device-pair-result')).toHaveAttribute('data-status', 'paired');
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    expect(Message.success).toHaveBeenCalledWith('settings.devices.pair.pairedToast:{"name":"New iPhone"}');
  });

  it('lets the user reject an unexpected requester', async () => {
    mocks.create.mockResolvedValue(offer);
    mocks.reject.mockResolvedValue({ offer_id: 'offer_1', status: 'rejected', expires_at: offer.expires_at });
    renderPage();
    fireEvent.click(await screen.findByTestId('device-pair-start'));
    await screen.findByTestId('device-pair-code');
    emitPairing({
      offer_id: 'offer_1',
      status: 'confirming',
      device_name: 'Unknown',
      platform: 'android',
      expires_at: offer.expires_at,
    });
    fireEvent.click(screen.getByTestId('device-pair-reject'));
    await waitFor(() => expect(mocks.reject).toHaveBeenCalledWith({ offer_id: 'offer_1' }));
    expect(await screen.findByTestId('device-pair-result')).toHaveAttribute('data-status', 'rejected');
    expect(screen.getByTestId('device-pair-start')).toHaveTextContent('settings.devices.pair.regenerate');
  });

  it('falls back to polling and treats a purged offer (404) as expired', async () => {
    mocks.create.mockResolvedValue(offer);
    mocks.get.mockRejectedValue(
      new BackendHttpError({ method: 'GET', path: '/x', status: 404, body: { error: 'Pairing offer not found' } })
    );
    renderPage(20);
    fireEvent.click(await screen.findByTestId('device-pair-start'));
    expect(await screen.findByTestId('device-pair-result')).toHaveAttribute('data-status', 'expired');
    expect(mocks.get).toHaveBeenCalledWith({ offer_id: 'offer_1' });
  });

  it('warns when the phone cannot reach this desktop', async () => {
    mocks.create.mockResolvedValue(offer);
    mocks.webuiStatus.mockResolvedValue({
      running: false,
      port: 25808,
      allowRemote: false,
      localUrl: 'http://localhost:25808',
    });
    renderPage();
    fireEvent.click(await screen.findByTestId('device-pair-start'));
    expect(await screen.findByTestId('device-pair-reach-hint')).toBeInTheDocument();
  });

  it('blocks pairing at the 5-device cap and localizes the Core limit error', async () => {
    mocks.list.mockResolvedValue(Array.from({ length: 5 }, (_, i) => device({ id: `dev_${i}`, name: `Phone ${i}` })));
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId('device-row')).toHaveLength(5));
    expect(screen.getByTestId('device-pair-start')).toBeDisabled();
    expect(screen.getByTestId('device-pair-limit')).toHaveTextContent('settings.devices.limitReached:{"max":5}');
  });

  it('shows the localized Core error when pairing fails', async () => {
    mocks.create.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/auth/devices/pair/offers',
        status: 409,
        body: { error: 'Device limit reached', code: 'DEVICE_LIMIT_REACHED' },
      })
    );
    renderPage();
    fireEvent.click(await screen.findByTestId('device-pair-start'));
    expect(await screen.findByTestId('device-pair-error')).toHaveTextContent('settings.devices.error.limit:{"max":5}');
  });

  it('renames with client-side validation', async () => {
    mocks.rename.mockResolvedValue(device({ name: 'Work phone' }));
    renderPage();
    const [row] = await screen.findAllByTestId('device-row');
    fireEvent.click(within(row).getByTestId('device-rename'));
    const input = await screen.findByTestId('device-rename-input');
    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.getByTestId('device-rename-error')).toHaveTextContent('settings.devices.nameError.empty');
    fireEvent.change(input, { target: { value: '  Work phone ' } });
    expect(screen.queryByTestId('device-rename-error')).toBeNull();
    fireEvent.click(screen.getByTestId('device-rename-ok'));
    await waitFor(() => expect(mocks.rename).toHaveBeenCalledWith({ id: 'dev_1', name: 'Work phone' }));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
  });

  it('revokes only after a second confirmation', async () => {
    mocks.revoke.mockResolvedValue(undefined);
    renderPage();
    const rows = await screen.findAllByTestId('device-row');
    fireEvent.click(within(rows[1]).getByTestId('device-revoke'));
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(await screen.findByTestId('device-revoke-body')).toHaveTextContent('"name":"Old Pixel"');
    fireEvent.click(screen.getByTestId('device-revoke-ok'));
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith({ id: 'dev_2' }));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
  });

  it('localizes a revoke failure', async () => {
    mocks.revoke.mockRejectedValue(
      new BackendHttpError({ method: 'DELETE', path: '/x', status: 404, body: { error: 'Device not found' } })
    );
    renderPage();
    const [row] = await screen.findAllByTestId('device-row');
    fireEvent.click(within(row).getByTestId('device-revoke'));
    fireEvent.click(await screen.findByTestId('device-revoke-ok'));
    await waitFor(() => expect(Message.error).toHaveBeenCalledWith('settings.devices.error.notFound'));
  });

  it("routes pushes to the user's own IM session or turns them off", async () => {
    mocks.list.mockResolvedValue([device({ push_kind: 'im', push_target: 'sess_gone' })]);
    mocks.setPush.mockResolvedValue(device());
    renderPage();
    const [row] = await screen.findAllByTestId('device-row');
    const select = within(row).getByTestId('device-push-select');
    // The stale target stays visible instead of silently showing "none".
    await waitFor(() => expect(select).toHaveTextContent('settings.devices.push.unavailableTarget'));
    fireEvent.click(select.querySelector('.arco-select-view') ?? select);
    fireEvent.click(await screen.findByText('Telegram · Lian'));
    await waitFor(() =>
      expect(mocks.setPush).toHaveBeenCalledWith({ id: 'dev_1', push_kind: 'im', push_target: 'sess_tg' })
    );
    fireEvent.click(select.querySelector('.arco-select-view') ?? select);
    fireEvent.click(await screen.findByText('settings.devices.push.none'));
    await waitFor(() => expect(mocks.setPush).toHaveBeenCalledWith({ id: 'dev_1', push_kind: 'none' }));
  });
});
