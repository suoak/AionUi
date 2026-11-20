/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { remoteBackend, sshTunnel, type IRemoteBackendStatus, type ISshTunnelStatus } from '@/common/adapter/ipcBridge';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Alert, Button, Form, Input, InputNumber, Message, Modal, Space, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const { Text, Title } = Typography;

/**
 * E14: start a system-OpenSSH local forward and point the desktop renderer at
 * the headless WorkMate Host on the other end. Desktop-only. No password field (D14-3).
 */
type RemoteHostSshSectionProps = {
  /**
   * 3.0 V7: the Remote Host settings page renders its own header, so the
   * section drops its heading and top border there.
   */
  standalone?: boolean;
};

const RemoteHostSshSection: React.FC<RemoteHostSshSectionProps> = ({ standalone = false }) => {
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();
  const [status, setStatus] = useState<ISshTunnelStatus>({ running: false });
  const [connection, setConnection] = useState<IRemoteBackendStatus>({ mode: 'local', port: 0 });
  const [busy, setBusy] = useState(false);
  const [remote, setRemote] = useState('');
  const [localPort, setLocalPort] = useState(25808);
  const [remotePort, setRemotePort] = useState(25808);
  const [identityFile, setIdentityFile] = useState('');

  const refresh = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const [nextTunnel, nextConnection] = await Promise.all([
        sshTunnel.getStatus.invoke(),
        remoteBackend.getStatus.invoke(),
      ]);
      setStatus(nextTunnel);
      setConnection(nextConnection);
    } catch {
      // bridge unavailable in webui / tests
    }
  }, [isDesktop]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!isDesktop) {
    return (
      <div className='py-12px' data-testid='remote-host-ssh-section'>
        {standalone ? null : <Title heading={6}>{t('settings.remoteHost.title')}</Title>}
        <Text type='secondary'>{t('settings.remoteHost.desktopOnly')}</Text>
      </div>
    );
  }

  const connectPort = status.running && typeof status.localPort === 'number' ? status.localPort : localPort;
  const connectUrl = `http://127.0.0.1:${connectPort}`;
  const isRemote = connection.mode === 'remote';

  const onStart = async () => {
    setBusy(true);
    try {
      const next = await sshTunnel.start.invoke({
        remote: remote.trim(),
        localPort,
        remotePort,
        identityFile: identityFile.trim() || undefined,
      });
      setStatus(next);
      Message.success(t('settings.remoteHost.tunnelUp', { url: next.localUrl ?? `http://127.0.0.1:${localPort}` }));
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onStop = async () => {
    setBusy(true);
    try {
      const next = await sshTunnel.stop.invoke();
      setStatus(next);
      Message.success(t('settings.remoteHost.tunnelStopped'));
      await refresh();
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const onConnect = () => {
    Modal.confirm({
      title: t('settings.remoteHost.connectConfirmTitle'),
      content: t('settings.remoteHost.connectConfirmContent', { url: connectUrl }),
      okText: t('settings.remoteHost.connect'),
      onOk: async () => {
        setBusy(true);
        try {
          const next = await remoteBackend.connect.invoke({ port: connectPort });
          setConnection(next);
        } catch (error) {
          Message.error(error instanceof Error ? error.message : String(error));
          throw error;
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const onDisconnect = async () => {
    setBusy(true);
    try {
      const next = await remoteBackend.disconnect.invoke();
      setConnection(next);
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={standalone ? 'py-4px' : 'py-12px border-t border-[var(--color-border-2)]'}
      data-testid='remote-host-ssh-section'
    >
      {standalone ? null : <Title heading={6}>{t('settings.remoteHost.title')}</Title>}
      {standalone ? null : (
        <Text type='secondary' className='block mb-8px'>
          {t('settings.remoteHost.description')}
        </Text>
      )}
      <Alert type='info' content={t('settings.remoteHost.alert')} className='mb-12px' />
      {isRemote ? (
        <Alert
          type='success'
          className='mb-12px'
          data-testid='remote-host-connected'
          content={t('settings.remoteHost.connectedBanner', {
            url: connection.baseUrl ?? `http://127.0.0.1:${connection.port}`,
          })}
        />
      ) : null}
      <Form layout='vertical' size='small' style={{ maxWidth: 480 }}>
        <Form.Item label={t('settings.remoteHost.sshDestination')} required>
          <Input
            data-testid='ssh-tunnel-remote'
            placeholder='user@gpu-box'
            value={remote}
            onChange={setRemote}
            disabled={status.running}
          />
        </Form.Item>
        <Form.Item label={t('settings.remoteHost.localPort')}>
          <InputNumber
            data-testid='ssh-tunnel-local-port'
            min={1}
            max={65535}
            value={localPort}
            onChange={(v) => setLocalPort(typeof v === 'number' ? v : 25808)}
            disabled={status.running}
          />
        </Form.Item>
        <Form.Item label={t('settings.remoteHost.remotePort')}>
          <InputNumber
            data-testid='ssh-tunnel-remote-port'
            min={1}
            max={65535}
            value={remotePort}
            onChange={(v) => setRemotePort(typeof v === 'number' ? v : 25808)}
            disabled={status.running}
          />
        </Form.Item>
        <Form.Item label={t('settings.remoteHost.identityFile')}>
          <Input
            data-testid='ssh-tunnel-identity'
            placeholder='~/.ssh/id_ed25519'
            value={identityFile}
            onChange={setIdentityFile}
            disabled={status.running}
          />
        </Form.Item>
      </Form>
      <Space wrap>
        <Button
          type='primary'
          loading={busy}
          disabled={status.running || !remote.trim()}
          onClick={() => void onStart()}
        >
          {t('settings.remoteHost.startTunnel')}
        </Button>
        <Button loading={busy} disabled={!status.running} onClick={() => void onStop()}>
          {t('settings.remoteHost.stopTunnel')}
        </Button>
        <Button
          type={isRemote ? 'secondary' : 'primary'}
          loading={busy}
          disabled={isRemote}
          data-testid='remote-host-connect'
          onClick={() => onConnect()}
        >
          {t('settings.remoteHost.connect')}
        </Button>
        <Button
          loading={busy}
          disabled={!isRemote}
          data-testid='remote-host-disconnect'
          onClick={() => void onDisconnect()}
        >
          {t('settings.remoteHost.disconnect')}
        </Button>
      </Space>
      {status.running ? (
        <Text className='mt-8px block' data-testid='ssh-tunnel-running'>
          {t('settings.remoteHost.running', {
            pidSuffix: status.pid ? t('settings.remoteHost.pidSuffix', { pid: status.pid }) : '',
            display: status.display ?? status.localUrl,
          })}
        </Text>
      ) : null}
      {status.lastError && !status.running ? (
        <Text type='error' className='mt-8px block'>
          {status.lastError}
        </Text>
      ) : null}
    </div>
  );
};

export default RemoteHostSshSection;
