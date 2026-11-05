/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Input, Message, Spin, Switch, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { LocalKbSource } from '@/common/types/localKb';
import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

/** Local knowledge base settings. Default OFF; never auto-injected into daily chat. */
export const LocalKbSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  const [enabled, setEnabled] = useState(false);
  const [sources, setSources] = useState<LocalKbSource[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [textLabel, setTextLabel] = useState('');
  const [textBody, setTextBody] = useState('');

  const reload = useCallback(async () => {
    try {
      const settings = await ipcBridge.localKb.getSettings.invoke();
      setEnabled(!!settings?.enabled);
      if (settings?.enabled) {
        const list = await ipcBridge.localKb.listSources.invoke();
        setSources(list ?? []);
      } else {
        setSources([]);
      }
      setLoadError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(msg || tRef.current('settings.localKb.error.load'));
      setSources((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onToggle = async (next: boolean) => {
    setBusy(true);
    try {
      const settings = await ipcBridge.localKb.updateSettings.invoke({ enabled: next });
      setEnabled(!!settings.enabled);
      Message.success(settings.enabled ? t('settings.localKb.enabledToast') : t('settings.localKb.disabledToast'));
      await reload();
    } catch (err) {
      Message.error(err instanceof Error ? err.message : t('settings.localKb.error.save'));
    } finally {
      setBusy(false);
    }
  };

  const onAddText = async () => {
    const label = textLabel.trim();
    const text = textBody.trim();
    if (!label || !text) {
      Message.warning(t('settings.localKb.add.required'));
      return;
    }
    setBusy(true);
    try {
      await ipcBridge.localKb.createSource.invoke({ kind: 'text', label, text });
      setTextLabel('');
      setTextBody('');
      Message.success(t('settings.localKb.add.success'));
      await reload();
    } catch (err) {
      Message.error(err instanceof Error ? err.message : t('settings.localKb.error.save'));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    setBusy(true);
    try {
      await ipcBridge.localKb.deleteSource.invoke({ id });
      Message.success(t('settings.localKb.deleted'));
      await reload();
    } catch (err) {
      Message.error(err instanceof Error ? err.message : t('settings.localKb.error.save'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='flex flex-col gap-16px' data-testid='local-kb-settings'>
      <SettingsPageHeader title={t('settings.localKb.title')} description={t('settings.localKb.description')} />
      <Alert type='info' content={t('settings.localKb.scopeNote')} />
      {loadError ? <Alert type='error' data-testid='local-kb-load-error' content={loadError} /> : null}

      <div className='flex items-center justify-between gap-12px rounded-8px border border-border-2 px-16px py-12px'>
        <div>
          <div className='text-14px font-[500] text-t-primary'>{t('settings.localKb.enableLabel')}</div>
          <div className='text-12px text-t-secondary mt-2px'>{t('settings.localKb.enableHint')}</div>
        </div>
        <Switch
          checked={enabled}
          loading={busy}
          onChange={(v) => void onToggle(v)}
          data-testid='local-kb-enable-switch'
        />
      </div>

      {!enabled ? (
        <Typography.Text type='secondary'>{t('settings.localKb.disabledHint')}</Typography.Text>
      ) : (
        <>
          <div className='flex flex-col gap-8px rounded-8px border border-border-2 px-16px py-12px'>
            <div className='text-14px font-[500]'>{t('settings.localKb.add.title')}</div>
            <Input
              value={textLabel}
              onChange={setTextLabel}
              placeholder={t('settings.localKb.add.labelPlaceholder')}
              data-testid='local-kb-text-label'
            />
            <Input.TextArea
              value={textBody}
              onChange={setTextBody}
              placeholder={t('settings.localKb.add.bodyPlaceholder')}
              autoSize={{ minRows: 3, maxRows: 10 }}
              data-testid='local-kb-text-body'
            />
            <div>
              <Button type='primary' loading={busy} onClick={() => void onAddText()} data-testid='local-kb-add-text'>
                {t('settings.localKb.add.submit')}
              </Button>
            </div>
          </div>

          <div className='flex flex-col gap-8px'>
            <div className='text-14px font-[500]'>{t('settings.localKb.sources.title')}</div>
            {sources === null ? (
              <Spin className='self-center' />
            ) : sources.length === 0 ? (
              <Typography.Text type='secondary'>{t('settings.localKb.sources.empty')}</Typography.Text>
            ) : (
              sources.map((s) => (
                <div
                  key={s.id}
                  className='flex items-center justify-between gap-12px rounded-8px border border-border-2 px-12px py-10px'
                  data-testid='local-kb-source-row'
                >
                  <div className='min-w-0'>
                    <div className='text-13px font-[500] truncate'>{s.label}</div>
                    <div className='text-12px text-t-secondary'>
                      {t('settings.localKb.sources.meta', {
                        kind: s.kind,
                        count: s.document_count,
                      })}
                      {s.origin_path ? ` · ${s.origin_path}` : ''}
                    </div>
                  </div>
                  <Button
                    status='danger'
                    size='mini'
                    loading={busy}
                    onClick={() => void onDelete(s.id)}
                    data-testid='local-kb-delete-source'
                  >
                    {t('settings.localKb.sources.delete')}
                  </Button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

const LocalKbSettings: React.FC = () => (
  <SettingsPageWrapper>
    <LocalKbSettingsContent />
  </SettingsPageWrapper>
);

export default LocalKbSettings;
