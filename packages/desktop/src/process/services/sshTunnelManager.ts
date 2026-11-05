/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { buildSshTunnelPlan, type SshTunnelRequest } from '@/common/ssh/sshTunnelPlan';

export type SshTunnelStatus = {
  running: boolean;
  remote?: string;
  localPort?: number;
  remotePort?: number;
  localUrl?: string;
  display?: string;
  pid?: number;
  lastError?: string;
};

type TunnelState = {
  child: ChildProcessWithoutNullStreams;
  request: SshTunnelRequest;
  display: string;
  localUrl: string;
  lastError?: string;
};

let active: TunnelState | null = null;

export function getSshTunnelStatus(): SshTunnelStatus {
  if (!active) {
    return { running: false };
  }
  return {
    running: !active.child.killed && active.child.exitCode === null,
    remote: active.request.remote,
    localPort: active.request.localPort,
    remotePort: active.request.remotePort,
    localUrl: active.localUrl,
    display: active.display,
    pid: active.child.pid,
    lastError: active.lastError,
  };
}

export async function startSshTunnel(request: SshTunnelRequest): Promise<SshTunnelStatus> {
  if (active && active.child.exitCode === null && !active.child.killed) {
    throw new Error('An SSH tunnel is already running; stop it before starting another');
  }

  const plan = buildSshTunnelPlan(request);
  const child = spawn(plan.command, plan.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
    windowsHide: true,
  });

  const state: TunnelState = {
    child,
    request,
    display: plan.display,
    localUrl: plan.localUrl,
  };
  active = state;

  child.stderr.on('data', (buf: Buffer) => {
    const text = buf.toString('utf8').trim();
    if (text) state.lastError = text.slice(0, 500);
  });

  child.on('exit', () => {
    if (active?.child === child) {
      // keep lastError for status; mark not running via exitCode
    }
  });

  // Brief settle — ExitOnForwardFailure will exit quickly on bind errors.
  await new Promise((r) => setTimeout(r, 250));
  if (child.exitCode !== null) {
    const err = state.lastError ?? `ssh exited with code ${child.exitCode}`;
    active = null;
    throw new Error(err);
  }

  return getSshTunnelStatus();
}

export async function stopSshTunnel(): Promise<SshTunnelStatus> {
  if (!active) {
    return { running: false };
  }
  const child = active.child;
  active = null;
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 100));
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }
  return { running: false };
}
