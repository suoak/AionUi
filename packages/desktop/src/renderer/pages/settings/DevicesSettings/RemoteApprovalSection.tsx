/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IChannelUser } from '@/common/types/channel/channel';
import type { RemoteApprover } from '@/common/types/remoteApproval';
import { REMOTE_APPROVAL_TTL_DEFAULT, REMOTE_APPROVAL_TTL_MAX } from '@/common/types/remoteApproval';
import { Button, InputNumber, Message, Select, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const approverKey = (platform: string, id: string) => `${platform}\u0000${id}`;

const errorText = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : String(error ?? '');

/**
 * 3.0 U9: remote approve-to-execute settings — how long a phone/IM request
 * stays answerable, and which paired IM accounts count as "me". Hidden on
 * cores without C9.
 */
const RemoteApprovalSection: React.FC = () => {
  const { t } = useTranslation();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [ttl, setTtl] = useState<number>(REMOTE_APPROVAL_TTL_DEFAULT);
  const [savedTtl, setSavedTtl] = useState<number>(REMOTE_APPROVAL_TTL_DEFAULT);
  const [approvers, setApprovers] = useState<RemoteApprover[]>([]);
  const [users, setUsers] = useState<IChannelUser[]>([]);
  const [pick, setPick] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const api = ipcBridge.remoteApproval;
    if (!api) {
      setAvailable(false);
      return;
    }
    try {
      const [settings, list] = await Promise.all([api.settings.get.invoke(), api.approvers.list.invoke()]);
      if (!settings) {
        setAvailable(false);
        return;
      }
      setTtl(settings.ttl_minutes);
      setSavedTtl(settings.ttl_minutes);
      setApprovers(Array.isArray(list) ? list : []);
      setAvailable(true);
    } catch {
      setAvailable(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const usersApi = ipcBridge.channel?.getAuthorizedUsers;
    if (!usersApi) return;
    usersApi
      .invoke()
      .then((list) => setUsers(list ?? []))
      .catch((): undefined => undefined);
  }, [load]);

  const bound = useMemo(
    () => new Set(approvers.map((a) => approverKey(a.platform_type, a.platform_user_id))),
    [approvers]
  );
  const userLabel = useCallback(
    (platform: string, id: string) => {
      const user = users.find((u) => u.platformType === platform && u.platformUserId === id);
      return `${platform} · ${user?.display_name || id}`;
    },
    [users]
  );
  const candidates = users.filter((u) => !bound.has(approverKey(u.platformType, u.platformUserId)));

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await load();
    } catch (error) {
      Message.error(errorText(error) || t('settings.devices.remote.failed'));
    } finally {
      setBusy(false);
    }
  };

  if (!available) return null;

  return (
    <section
      className='flex flex-col gap-12px rd-12px border border-solid border-[var(--color-border-2)] p-16px'
      data-testid='remote-approval-settings'
    >
      <div>
        <div className='text-14px font-medium text-t-primary'>{t('settings.devices.remote.title')}</div>
        <Typography.Text type='secondary' className='text-12px'>
          {t('settings.devices.remote.description')}
        </Typography.Text>
      </div>
      <div className='flex flex-wrap items-center gap-8px'>
        <span className='text-13px text-t-primary'>{t('settings.devices.remote.ttl')}</span>
        <InputNumber
          size='small'
          className='w-120px'
          min={1}
          max={REMOTE_APPROVAL_TTL_MAX}
          precision={0}
          value={ttl}
          suffix={t('settings.devices.remote.minutes')}
          onChange={(value) => setTtl(typeof value === 'number' ? value : savedTtl)}
          data-testid='remote-approval-ttl'
        />
        <Button
          size='small'
          type='primary'
          loading={busy}
          disabled={ttl === savedTtl}
          data-testid='remote-approval-ttl-save'
          onClick={() => void run(() => ipcBridge.remoteApproval.settings.set.invoke({ ttl_minutes: ttl }))}
        >
          {t('settings.devices.remote.save')}
        </Button>
      </div>
      <div className='flex flex-col gap-6px'>
        <span className='text-13px text-t-primary'>{t('settings.devices.remote.approvers')}</span>
        {approvers.length === 0 ? (
          <Typography.Text type='secondary' className='text-12px'>
            {t('settings.devices.remote.noApprovers')}
          </Typography.Text>
        ) : (
          <ul className='m-0 p-0 list-none flex flex-col gap-4px' data-testid='remote-approval-approvers'>
            {approvers.map((a) => (
              <li key={approverKey(a.platform_type, a.platform_user_id)} className='flex items-center gap-8px'>
                <span className='text-13px text-t-secondary truncate'>
                  {userLabel(a.platform_type, a.platform_user_id)}
                </span>
                <Button
                  size='mini'
                  type='text'
                  status='danger'
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      ipcBridge.remoteApproval.approvers.remove.invoke({
                        platform_type: a.platform_type,
                        platform_user_id: a.platform_user_id,
                      })
                    )
                  }
                >
                  {t('settings.devices.remote.remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {candidates.length > 0 ? (
          <div className='flex items-center gap-8px'>
            <Select
              size='small'
              className='w-260px'
              value={pick}
              placeholder={t('settings.devices.remote.pick')}
              onChange={(value: string) => setPick(value)}
              data-testid='remote-approval-pick'
            >
              {candidates.map((u) => (
                <Select.Option key={u.id} value={u.id}>
                  {userLabel(u.platformType, u.platformUserId)}
                </Select.Option>
              ))}
            </Select>
            <Button
              size='small'
              disabled={!pick || busy}
              data-testid='remote-approval-add'
              onClick={() => {
                const user = candidates.find((u) => u.id === pick);
                if (!user) return;
                void run(async () => {
                  await ipcBridge.remoteApproval.approvers.add.invoke({
                    platform_type: user.platformType,
                    platform_user_id: user.platformUserId,
                  });
                  setPick(undefined);
                });
              }}
            >
              {t('settings.devices.remote.add')}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default RemoteApprovalSection;
