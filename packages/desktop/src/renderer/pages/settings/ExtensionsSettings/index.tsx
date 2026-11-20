/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 3.0 V7: Installed extensions — name, version, source, contributions,
 * permissions / risk level and an on/off switch. Refusals are shown through
 * the reason-code catalogue (`ExtensionReasonMessage`).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Input, Message, Spin, Switch, Tag } from '@arco-design/web-react';
import { Search } from '@icon-park/react';
import { ipcBridge } from '@/common';
import type { IExtensionInfo } from '@/common/adapter/ipcBridge';
import { ExtensionReasonMessage } from '@/renderer/components/extensions/ExtensionReasonMessage';
import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import {
  CONTRIBUTION_KINDS,
  countContributions,
  filterExtensions,
  isKnownSource,
  normalizePermissions,
  sortExtensions,
  type ContributionCounts,
  type PermissionsView,
} from './extensionsModel';

const RISK_COLOR: Record<string, string> = { safe: 'green', moderate: 'orange', dangerous: 'red' };

type PermissionsState = { loading: boolean; error?: unknown; view?: PermissionsView };

const ExtensionCard: React.FC<{
  ext: IExtensionInfo;
  counts?: ContributionCounts;
  busy: boolean;
  error?: unknown;
  onToggle: (ext: IExtensionInfo, next: boolean) => void;
}> = ({ ext, counts, busy, error, onToggle }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<PermissionsState>({ loading: false });
  const name = ext.display_name || ext.name;

  const loadPermissions = useCallback(async () => {
    setPerm({ loading: true });
    try {
      const raw: unknown = await ipcBridge.extensions.getPermissions.invoke({ name: ext.name });
      setPerm({ loading: false, view: normalizePermissions(raw) });
    } catch (err) {
      setPerm({ loading: false, error: err });
    }
  }, [ext.name]);

  const togglePermissions = () => {
    const next = !open;
    setOpen(next);
    if (next && !perm.view && !perm.loading) void loadPermissions();
  };

  const listed = CONTRIBUTION_KINDS.filter((kind) => (counts?.[kind] ?? 0) > 0);

  return (
    <div
      className='rounded-12px border border-solid border-border-2 bg-2 px-16px py-14px flex flex-col gap-8px'
      data-testid='extension-card'
      data-extension={ext.name}
    >
      <div className='flex items-start justify-between gap-12px'>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-8px'>
            <span className='text-14px font-[600] text-t-primary truncate'>{name}</span>
            <Tag size='small' bordered>
              <bdi>{t('settings.extensionsPage.version', { version: ext.version })}</bdi>
            </Tag>
            <Tag size='small' color='arcoblue' data-testid='extension-source'>
              {isKnownSource(ext.source)
                ? t(`settings.extensionsPage.source.${ext.source}`)
                : t('settings.extensionsPage.source.other', { source: ext.source })}
            </Tag>
            {perm.view?.riskLevel ? (
              <Tag size='small' color={RISK_COLOR[perm.view.riskLevel]} data-testid='extension-risk'>
                {t(`settings.extensionsPage.risk.${perm.view.riskLevel}`)}
              </Tag>
            ) : null}
          </div>
          <div className='mt-2px text-12px text-t-tertiary font-mono truncate' dir='ltr'>
            {ext.name}
          </div>
          {ext.description ? <div className='mt-6px text-13px text-t-secondary'>{ext.description}</div> : null}
        </div>
        <Switch
          checked={ext.enabled}
          loading={busy}
          aria-label={t('settings.extensionsPage.toggleLabel', { name })}
          data-testid='extension-toggle'
          onChange={(next) => onToggle(ext, next)}
        />
      </div>

      <div className='text-12px text-t-secondary' data-testid='extension-contributions'>
        {!ext.enabled
          ? t('settings.extensionsPage.contributions.hiddenWhileOff')
          : listed.length === 0
            ? t('settings.extensionsPage.contributions.none')
            : listed
                .map((kind) => t(`settings.extensionsPage.contributions.${kind}`, { count: counts?.[kind] ?? 0 }))
                .join(t('settings.extensionsPage.contributions.separator'))}
      </div>

      {error ? (
        <Alert
          type='error'
          data-testid='extension-toggle-error'
          content={
            <ExtensionReasonMessage
              raw={error}
              fallback={t(
                ext.enabled ? 'settings.extensionsPage.disableFailed' : 'settings.extensionsPage.enableFailed',
                { name }
              )}
            />
          }
        />
      ) : null}

      <div>
        <Button size='mini' type='text' onClick={togglePermissions} data-testid='extension-permissions-toggle'>
          {open ? t('settings.extensionsPage.permissions.hide') : t('settings.extensionsPage.permissions.show')}
        </Button>
        {open ? (
          <div className='mt-4px ps-8px' data-testid='extension-permissions'>
            {perm.loading ? (
              <Spin size={14} />
            ) : perm.error ? (
              <div className='text-12px text-danger'>
                <ExtensionReasonMessage
                  raw={perm.error}
                  fallback={t('settings.extensionsPage.permissions.loadFailed')}
                />
              </div>
            ) : (perm.view?.details.length ?? 0) === 0 ? (
              <div className='text-12px text-t-secondary'>{t('settings.extensionsPage.permissions.none')}</div>
            ) : (
              <ul className='m-0 ps-16px flex flex-col gap-4px'>
                {perm.view!.details.map((d) => (
                  <li key={d.permission} className='text-12px text-t-secondary'>
                    <span className='font-mono text-t-primary' dir='ltr'>
                      {d.permission}
                    </span>
                    {d.level ? (
                      <span className='ms-6px'>
                        {['none', 'limited', 'full'].includes(d.level)
                          ? t(`settings.extensionsPage.permissions.level.${d.level}`)
                          : d.level}
                      </span>
                    ) : null}
                    {d.description ? <span className='ms-6px'>· {d.description}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const ExtensionsSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const [list, setList] = useState<IExtensionInfo[] | null>(null);
  const [counts, setCounts] = useState<Map<string, ContributionCounts>>(new Map());
  const [loadError, setLoadError] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, unknown>>({});

  const reload = useCallback(async () => {
    try {
      const extensions = await ipcBridge.extensions.getLoadedExtensions.invoke();
      setList(sortExtensions(extensions ?? []));
      setLoadError(null);
    } catch (err) {
      setLoadError(err);
      setList((prev) => prev ?? []);
    }
    // Contribution lists are best effort: a failure only hides the counts.
    const safe = <T,>(p: Promise<T>) => p.catch(() => [] as unknown as T);
    const [settingsTabs, commands, panels, views] = await Promise.all([
      safe(ipcBridge.extensions.getSettingsTabs.invoke()),
      safe(ipcBridge.extensions.getCommands.invoke()),
      safe(ipcBridge.extensions.getPanels.invoke()),
      safe(ipcBridge.extensions.getWorkPanelViews.invoke()),
    ]);
    setCounts(countContributions({ settingsTabs, commands, panels, views }));
  }, []);

  useEffect(() => {
    void reload();
    const off = ipcBridge.extensions.stateChanged.on(() => {
      void reload();
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, [reload]);

  const onToggle = useCallback(
    async (ext: IExtensionInfo, next: boolean) => {
      const name = ext.display_name || ext.name;
      setBusy((b) => ({ ...b, [ext.name]: true }));
      setErrors(({ [ext.name]: _drop, ...rest }) => rest);
      try {
        if (next) await ipcBridge.extensions.enableExtension.invoke({ name: ext.name });
        else await ipcBridge.extensions.disableExtension.invoke({ name: ext.name });
        Message.success(
          tRef.current(next ? 'settings.extensionsPage.enabledToast' : 'settings.extensionsPage.disabledToast', {
            name,
          })
        );
        await reload();
      } catch (err) {
        setErrors((e) => ({ ...e, [ext.name]: err }));
      } finally {
        setBusy(({ [ext.name]: _drop, ...rest }) => rest);
      }
    },
    [reload]
  );

  const visible = useMemo(() => filterExtensions(list ?? [], query), [list, query]);

  return (
    <div className='flex flex-col gap-16px' data-testid='extensions-settings'>
      <SettingsPageHeader
        title={t('settings.extensionsPage.title')}
        description={t('settings.extensionsPage.description')}
        actions={
          <Input
            allowClear
            size='small'
            className='!w-200px'
            value={query}
            onChange={setQuery}
            prefix={<Search theme='outline' size='14' />}
            placeholder={t('settings.extensionsPage.searchPlaceholder')}
            aria-label={t('settings.extensionsPage.searchPlaceholder')}
            data-testid='extensions-search'
          />
        }
      />
      {loadError ? (
        <Alert
          type='error'
          data-testid='extensions-load-error'
          content={<ExtensionReasonMessage raw={loadError} fallback={t('settings.extensionsPage.loadFailed')} />}
          action={
            <Button size='mini' onClick={() => void reload()}>
              {t('settings.extensionsPage.retry')}
            </Button>
          }
        />
      ) : null}
      {list === null ? (
        <div className='flex items-center gap-8px text-13px text-t-secondary'>
          <Spin size={14} /> {t('settings.extensionsPage.loading')}
        </div>
      ) : list.length === 0 && !loadError ? (
        <div className='text-13px text-t-secondary' data-testid='extensions-empty'>
          {t('settings.extensionsPage.empty')}
        </div>
      ) : visible.length === 0 && list.length > 0 ? (
        <div className='text-13px text-t-secondary' data-testid='extensions-no-match'>
          {t('settings.extensionsPage.noMatch')}
        </div>
      ) : (
        <div className='flex flex-col gap-10px'>
          {visible.map((ext) => (
            <ExtensionCard
              key={ext.name}
              ext={ext}
              counts={counts.get(ext.name)}
              busy={!!busy[ext.name]}
              error={errors[ext.name]}
              onToggle={(e, next) => void onToggle(e, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ExtensionsSettings: React.FC = () => (
  <SettingsPageWrapper>
    <ExtensionsSettingsContent />
  </SettingsPageWrapper>
);

export default ExtensionsSettings;
