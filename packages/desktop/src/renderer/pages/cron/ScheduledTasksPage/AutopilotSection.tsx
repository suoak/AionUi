/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, Switch } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import WorkMateModal from '@renderer/components/base/WorkMateModal';
import { autopilotChannelOptions, isAutopilotBlockedMode, type AutopilotChannelOption } from './autopilot';
import type { AutopilotFormState } from './autopilot';

const NO_CHANNEL = '__inbox_only__';

type AutopilotSectionProps = {
  value: AutopilotFormState;
  onChange: (next: AutopilotFormState) => void;
  /** The permission mode the job will run with; plan / goal block Autopilot. */
  mode?: string | null;
  /** False for agent-created jobs: Core refuses full-auto there (403). */
  fullAutoAllowed: boolean;
};

/**
 * E8-6 Autopilot controls for a scheduled task: the Autopilot switch, the
 * full-auto (yolo) switch behind a risk confirmation, and the IM channel that
 * receives run summaries. Full-auto is off by default and can only be turned
 * on here, by the user, after confirming.
 */
const AutopilotSection: React.FC<AutopilotSectionProps> = ({ value, onChange, mode, fullAutoAllowed }) => {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [channels, setChannels] = useState<AutopilotChannelOption[]>([]);
  const [channelsState, setChannelsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const blocked = isAutopilotBlockedMode(mode);

  // Channels are fetched once, the first time Autopilot is switched on. The
  // request is tracked by a ref so the loading-state update does not cancel it.
  const channelsRequested = useRef(false);
  useEffect(() => {
    if (!value.enabled || channelsRequested.current) return;
    channelsRequested.current = true;
    let cancelled = false;
    setChannelsState('loading');
    Promise.all([ipcBridge.channel.getActiveSessions.invoke(), ipcBridge.channel.getAuthorizedUsers.invoke()])
      .then(([sessions, users]) => {
        if (cancelled) return;
        setChannels(autopilotChannelOptions(sessions ?? [], users ?? []));
        setChannelsState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setChannels([]);
        setChannelsState('error');
      });
    return () => {
      cancelled = true;
      // Unmounted or switched off mid-flight: allow a fresh load next time.
      channelsRequested.current = false;
    };
  }, [value.enabled]);

  const options = useMemo(() => {
    const list = [...channels];
    // Keep a saved channel selectable even when it is no longer listed.
    if (value.channelId && !list.some((option) => option.value === value.channelId)) {
      list.push({ value: value.channelId, label: t('cron.autopilot.channelUnavailable') });
    }
    return list;
  }, [channels, value.channelId, t]);

  const setEnabled = (enabled: boolean) => {
    // Turning Autopilot off also drops full-auto; turning it back on starts in Ask mode.
    onChange({ ...value, enabled, yolo: false });
  };

  const setYolo = (yolo: boolean) => {
    if (yolo) {
      setConfirmOpen(true);
      return;
    }
    onChange({ ...value, yolo: false });
  };

  return (
    <div
      className='mb-20px rounded-12px border border-solid border-[var(--color-border-2)] px-14px py-12px'
      data-testid='cron-autopilot-section'
    >
      <div className='flex items-start justify-between gap-16px'>
        <div className='min-w-0'>
          <p className='m-0 text-14px font-medium text-t-primary'>{t('cron.autopilot.title')}</p>
          <p className='mb-0 mt-4px text-12px leading-18px text-t-secondary'>{t('cron.autopilot.hint')}</p>
          {blocked && (
            <p
              className='mb-0 mt-4px text-12px leading-18px text-[rgb(var(--warning-6))]'
              data-testid='cron-autopilot-blocked'
            >
              {t('cron.autopilot.modeBlocked', { mode: mode ?? '' })}
            </p>
          )}
        </div>
        <Switch
          data-testid='cron-autopilot-switch'
          checked={value.enabled}
          disabled={blocked && !value.enabled}
          onChange={setEnabled}
        />
      </div>

      {value.enabled && (
        <div className='mt-12px flex flex-col gap-12px border-t border-t-solid border-[var(--color-border-2)] pt-12px'>
          <ul className='m-0 ps-18px text-12px leading-18px text-t-secondary' data-testid='cron-autopilot-guardrails'>
            <li>{t('cron.autopilot.guardrail.ask')}</li>
            <li>{t('cron.autopilot.guardrail.inbox')}</li>
            <li>{t('cron.autopilot.guardrail.summary')}</li>
          </ul>

          <div className='flex items-start justify-between gap-16px'>
            <div className='min-w-0'>
              <p className='m-0 text-14px font-medium text-t-primary'>{t('cron.autopilot.yolo.title')}</p>
              <p className='mb-0 mt-4px text-12px leading-18px text-t-secondary'>
                {fullAutoAllowed ? t('cron.autopilot.yolo.hint') : t('cron.autopilot.yolo.agentCreated')}
              </p>
            </div>
            <Switch
              data-testid='cron-autopilot-yolo-switch'
              checked={value.yolo}
              disabled={!fullAutoAllowed && !value.yolo}
              onChange={setYolo}
            />
          </div>

          <div>
            <p className='m-0 text-14px font-medium text-t-primary'>{t('cron.autopilot.channel.title')}</p>
            <p className='mb-8px mt-4px text-12px leading-18px text-t-secondary'>
              {channelsState === 'error'
                ? t('cron.autopilot.channel.loadFailed')
                : channelsState === 'ready' && channels.length === 0
                  ? t('cron.autopilot.channel.empty')
                  : t('cron.autopilot.channel.hint')}
            </p>
            <Select
              data-testid='cron-autopilot-channel-select'
              value={value.channelId ?? NO_CHANNEL}
              loading={channelsState === 'loading'}
              onChange={(next: string) =>
                onChange({ ...value, channelId: next && next !== NO_CHANNEL ? next : undefined })
              }
            >
              <Select.Option value={NO_CHANNEL}>{t('cron.autopilot.channel.none')}</Select.Option>
              {options.map((option) => (
                <Select.Option key={option.value} value={option.value}>
                  {option.label}
                </Select.Option>
              ))}
            </Select>
          </div>
        </div>
      )}

      <WorkMateModal
        visible={confirmOpen}
        title={t('cron.autopilot.yolo.confirmTitle')}
        okText={t('cron.autopilot.yolo.confirmOk')}
        cancelText={t('common.cancel')}
        onOk={() => {
          setConfirmOpen(false);
          onChange({ ...value, yolo: true });
        }}
        onCancel={() => setConfirmOpen(false)}
        style={{ width: 480 }}
      >
        <div
          className='flex flex-col gap-8px text-13px leading-20px text-t-primary'
          data-testid='cron-autopilot-yolo-confirm'
        >
          <p className='m-0'>{t('cron.autopilot.yolo.confirmIntro')}</p>
          <ul className='m-0 ps-18px'>
            <li>{t('cron.autopilot.yolo.riskCommands')}</li>
            <li>{t('cron.autopilot.yolo.riskIrreversible')}</li>
            <li>{t('cron.autopilot.yolo.riskUnattended')}</li>
          </ul>
          <p className='m-0 text-t-secondary'>{t('cron.autopilot.yolo.confirmOutro')}</p>
        </div>
      </WorkMateModal>
    </div>
  );
};

export default AutopilotSection;
