/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { sshTunnel, type ISshTunnelStatus } from '@/common/adapter/ipcBridge';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Alert, Button, Form, Input, InputNumber, Message, Space, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';

const { Text, Title } = Typography;

/**
 * E14: start a system-OpenSSH local forward to a headless WorkMate Host.
 * Desktop-only. No password field (D14-3).
 */
const RemoteHostSshSection: React.FC = () => {
  const isDesktop = isElectronDesktop();
  const [status, setStatus] = useState<ISshTunnelStatus>({ running: false });
  const [busy, setBusy] = useState(false);
  const [remote, setRemote] = useState('');
  const [localPort, setLocalPort] = useState(25808);
  const [remotePort, setRemotePort] = useState(25808);
  const [identityFile, setIdentityFile] = useState('');

  const refresh = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const next = await sshTunnel.getStatus.invoke();
      setStatus(next);
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
        <Title heading={6}>Remote Host (SSH)</Title>
        <Text type='secondary'>SSH tunnels to a headless Host are desktop-only. Open CSBU WorkMate desktop.</Text>
      </div>
    );
  }

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
      Message.success(`Tunnel up — use ${next.localUrl ?? `http://127.0.0.1:${localPort}`} (existing auth)`);
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
      Message.success('SSH tunnel stopped');
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='py-12px border-t border-[var(--color-border-2)]' data-testid='remote-host-ssh-section'>
      <Title heading={6}>Remote Host (SSH)</Title>
      <Text type='secondary' className='block mb-8px'>
        Forward loopback to a headless aioncore via system OpenSSH. Keys/agent only — no password in argv (D14-3).
      </Text>
      <Alert
        type='info'
        content='Remote must run aioncore --headless on loopback. Client keeps existing workspace auth (D14-2).'
        className='mb-12px'
      />
      <Form layout='vertical' size='small' style={{ maxWidth: 480 }}>
        <Form.Item label='SSH destination (user@host)' required>
          <Input
            data-testid='ssh-tunnel-remote'
            placeholder='user@gpu-box'
            value={remote}
            onChange={setRemote}
            disabled={status.running}
          />
        </Form.Item>
        <Form.Item label='Local port'>
          <InputNumber
            data-testid='ssh-tunnel-local-port'
            min={1}
            max={65535}
            value={localPort}
            onChange={(v) => setLocalPort(typeof v === 'number' ? v : 25808)}
            disabled={status.running}
          />
        </Form.Item>
        <Form.Item label='Remote Host port'>
          <InputNumber
            data-testid='ssh-tunnel-remote-port'
            min={1}
            max={65535}
            value={remotePort}
            onChange={(v) => setRemotePort(typeof v === 'number' ? v : 25808)}
            disabled={status.running}
          />
        </Form.Item>
        <Form.Item label='Identity file (optional)'>
          <Input
            data-testid='ssh-tunnel-identity'
            placeholder='~/.ssh/id_ed25519'
            value={identityFile}
            onChange={setIdentityFile}
            disabled={status.running}
          />
        </Form.Item>
      </Form>
      <Space>
        <Button
          type='primary'
          loading={busy}
          disabled={status.running || !remote.trim()}
          onClick={() => void onStart()}
        >
          Start tunnel
        </Button>
        <Button loading={busy} disabled={!status.running} onClick={() => void onStop()}>
          Stop
        </Button>
      </Space>
      {status.running ? (
        <Text className='mt-8px block' data-testid='ssh-tunnel-running'>
          Running{status.pid ? ` (pid ${status.pid})` : ''}: {status.display ?? status.localUrl}
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
