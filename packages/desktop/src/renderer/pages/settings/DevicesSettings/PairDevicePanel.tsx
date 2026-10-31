/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Message, Space, Spin, Typography } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import { ipcBridge } from '@/common';
import type { IWebUIStatus } from '@/common/adapter/ipcBridge';
import type { IDevicePairingOffer, IDevicePairingView } from '@/common/types/device';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import {
  MAX_DEVICES,
  buildPairingQrValue,
  getDeviceErrorMessage,
  isPairingClosed,
  isPairingReachable,
} from './devicesModel';

const QRCodeSVGLazy = React.lazy(async () => {
  const mod = await import('qrcode.react');
  return { default: mod.QRCodeSVG };
});

type PairDevicePanelProps = {
  /** Disable "pair" when the user already has the maximum number of devices. */
  atLimit: boolean;
  /** Called once a phone finishes pairing so the list can reload. */
  onPaired: () => void;
  /** Fallback poll for when the WebSocket event is missed. */
  pollIntervalMs?: number;
  /** Injected clock for tests. */
  now?: () => number;
};

const formatRemaining = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Desktop half of E9 pairing: create an offer, show its QR (token only) and
 * the 6-digit code, follow `device.pairing` until the phone pairs, and let the
 * user reject an unexpected requester.
 */
const PairDevicePanel: React.FC<PairDevicePanelProps> = ({ atLimit, onPaired, pollIntervalMs = 3000, now }) => {
  const { t } = useTranslation();
  const clock = now ?? Date.now;
  const [offer, setOffer] = useState<IDevicePairingOffer | null>(null);
  const [view, setView] = useState<IDevicePairingView | null>(null);
  const [webui, setWebui] = useState<IWebUIStatus | null>(null);
  const [creating, setCreating] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const pairedHandled = useRef<string | null>(null);

  const status = view?.status ?? (offer ? 'waiting' : undefined);
  const expired = Boolean(offer && clock() >= offer.expires_at && !isPairingClosed(status));
  const effectiveStatus = expired ? 'expired' : status;
  const open = Boolean(offer) && !isPairingClosed(effectiveStatus);

  const applyView = useCallback((next: IDevicePairingView | undefined | null) => {
    if (!next) return;
    setView((prev) => (prev && prev.offer_id !== next.offer_id ? prev : next));
  }, []);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const [created, webuiStatus] = await Promise.all([
        ipcBridge.device.pairing.create.invoke(),
        ipcBridge.webui.getStatus.invoke().catch((): null => null),
      ]);
      pairedHandled.current = null;
      setWebui(webuiStatus ?? null);
      setOffer(created);
      setView(null);
    } catch (err) {
      setError(getDeviceErrorMessage(err, t, 'pair'));
    } finally {
      setCreating(false);
    }
  };

  const reject = async () => {
    if (!offer || rejecting) return;
    setRejecting(true);
    try {
      applyView(await ipcBridge.device.pairing.reject.invoke({ offer_id: offer.offer_id }));
    } catch (err) {
      Message.error(getDeviceErrorMessage(err, t, 'reject'));
    } finally {
      setRejecting(false);
    }
  };

  // Live updates over WebSocket, filtered to this offer.
  useEffect(() => {
    if (!offer) return undefined;
    const off = ipcBridge.device.pairing.changed.on((event) => {
      if (event?.offer_id === offer.offer_id) applyView(event);
    });
    return () => {
      off?.();
    };
  }, [offer, applyView]);

  // Fallback poll + countdown while the offer is open.
  useEffect(() => {
    if (!offer || !open) return undefined;
    const countdown = setInterval(() => setTick((n) => n + 1), 1000);
    const poll = setInterval(() => {
      ipcBridge.device.pairing.get
        .invoke({ offer_id: offer.offer_id })
        .then(applyView)
        .catch((err: unknown) => {
          // A purged offer answers 404: treat it as expired.
          if (isBackendHttpError(err) && err.status === 404) {
            setView({ offer_id: offer.offer_id, status: 'expired', expires_at: offer.expires_at });
          }
        });
    }, pollIntervalMs);
    return () => {
      clearInterval(countdown);
      clearInterval(poll);
    };
  }, [offer, open, pollIntervalMs, applyView]);

  useEffect(() => {
    if (effectiveStatus === 'paired' && offer && pairedHandled.current !== offer.offer_id) {
      pairedHandled.current = offer.offer_id;
      Message.success(t('settings.devices.pair.pairedToast', { name: view?.device_name ?? '' }));
      onPaired();
    }
  }, [effectiveStatus, offer, view?.device_name, onPaired, t]);

  const requester =
    effectiveStatus === 'requested' || effectiveStatus === 'confirming'
      ? t('settings.devices.pair.requester', {
          name: view?.device_name || t('settings.devices.unnamed'),
          platform: t(`settings.devices.platform.${view?.platform ?? 'unknown'}`, {
            defaultValue: view?.platform ?? '',
          }),
        })
      : null;

  return (
    <div className='rd-12px border border-solid border-[var(--color-border-2)] p-16px' data-testid='device-pair-panel'>
      <div className='flex items-center justify-between gap-12px'>
        <div className='min-w-0'>
          <div className='text-15px font-[500] text-t-primary'>{t('settings.devices.pair.title')}</div>
          <div className='text-12px text-t-secondary mt-2px'>{t('settings.devices.pair.description')}</div>
        </div>
        {!open ? (
          <Button
            type='primary'
            loading={creating}
            disabled={atLimit}
            data-testid='device-pair-start'
            onClick={() => void create()}
          >
            {offer ? t('settings.devices.pair.regenerate') : t('settings.devices.pair.start')}
          </Button>
        ) : null}
      </div>
      {atLimit && !open ? (
        <Alert
          className='mt-12px'
          type='warning'
          data-testid='device-pair-limit'
          content={t('settings.devices.limitReached', { max: MAX_DEVICES })}
        />
      ) : null}
      {error ? <Alert className='mt-12px' type='error' data-testid='device-pair-error' content={error} /> : null}
      {offer && open ? (
        <div className='mt-16px flex flex-wrap gap-24px items-start'>
          <div className='p-8px bg-white rd-8px' data-testid='device-pair-qr'>
            <Suspense fallback={<Spin />}>
              <QRCodeSVGLazy value={buildPairingQrValue(webui, offer.qr_token)} size={160} />
            </Suspense>
          </div>
          <Space direction='vertical' size={8} className='min-w-0 flex-1'>
            <Typography.Text type='secondary'>{t('settings.devices.pair.codeLabel')}</Typography.Text>
            <span
              className='text-28px font-bold tracking-[0.3em] text-t-primary font-mono'
              data-testid='device-pair-code'
            >
              {offer.code}
            </span>
            <Typography.Text type='secondary' data-testid='device-pair-expires' data-tick={tick}>
              {t('settings.devices.pair.expiresIn', { time: formatRemaining(offer.expires_at - clock()) })}
            </Typography.Text>
            <Typography.Text data-testid='device-pair-status'>
              {requester ?? t('settings.devices.pair.status.waiting')}
            </Typography.Text>
            {requester ? (
              <Button
                status='danger'
                loading={rejecting}
                data-testid='device-pair-reject'
                onClick={() => void reject()}
              >
                {t('settings.devices.pair.reject')}
              </Button>
            ) : null}
            {!isPairingReachable(webui) ? (
              <Alert type='info' data-testid='device-pair-reach-hint' content={t('settings.devices.pair.reachHint')} />
            ) : null}
          </Space>
        </div>
      ) : null}
      {offer && !open && effectiveStatus ? (
        <div
          className='mt-12px flex items-center gap-8px'
          data-testid='device-pair-result'
          data-status={effectiveStatus}
        >
          {effectiveStatus !== 'paired' ? <Refresh theme='outline' size='14' className='text-t-secondary' /> : null}
          <Typography.Text type={effectiveStatus === 'paired' ? 'success' : 'secondary'}>
            {t(`settings.devices.pair.status.${effectiveStatus}`, { name: view?.device_name ?? '' })}
          </Typography.Text>
        </div>
      ) : null}
    </div>
  );
};

export default PairDevicePanel;
