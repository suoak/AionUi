/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  WORKMATE_HOST_URL_SCHEME,
  assertNoPasswordOptions,
  buildSshTunnelPlan,
  isSafeSshRemote,
  parseWorkmateHostUrl,
} from '@/common/ssh/sshTunnelPlan';

describe('sshTunnelPlan', () => {
  it('builds loopback forward with BatchMode and no password auth', () => {
    const plan = buildSshTunnelPlan({
      remote: 'user@box',
      localPort: 25808,
      remotePort: 25808,
    });
    expect(plan.command).toBe('ssh');
    expect(plan.args).toContain('-N');
    expect(plan.args).toContain('-L');
    expect(plan.args).toContain('25808:127.0.0.1:25808');
    expect(plan.args).toContain('BatchMode=yes');
    expect(plan.args).toContain('PasswordAuthentication=no');
    expect(plan.args).toContain('user@box');
    expect(plan.localUrl).toBe('http://127.0.0.1:25808');
    expect(plan.display).toMatch(/^ssh /);
  });

  it('includes identity file when provided', () => {
    const plan = buildSshTunnelPlan({
      remote: 'box',
      localPort: 1,
      remotePort: 2,
      identityFile: '/tmp/id',
    });
    expect(plan.args).toContain('-i');
    expect(plan.args).toContain('/tmp/id');
  });

  it('rejects unsafe remotes', () => {
    expect(isSafeSshRemote('user@host;rm')).toBe(false);
    expect(() => buildSshTunnelPlan({ remote: 'a b', localPort: 1, remotePort: 2 })).toThrow(/simple host/);
  });

  it('rejects password-related -o options (D14-3)', () => {
    expect(() => assertNoPasswordOptions(['PasswordAuthentication=yes'])).toThrow(/password/);
    expect(() =>
      buildSshTunnelPlan({
        remote: 'h',
        localPort: 1,
        remotePort: 2,
        extraOptions: ['PreferredAuthentications=password'],
      })
    ).toThrow(/password/);
  });

  it('parses workmate-host:// stub URLs', () => {
    expect(WORKMATE_HOST_URL_SCHEME).toBe('workmate-host');
    expect(parseWorkmateHostUrl('workmate-host://user@gpu')).toEqual({
      remote: 'user@gpu',
      remotePort: 25808,
    });
    expect(parseWorkmateHostUrl('workmate-host://gpu:25999')).toEqual({
      remote: 'gpu',
      remotePort: 25999,
    });
    expect(parseWorkmateHostUrl('http://nope')).toBeNull();
  });
});
