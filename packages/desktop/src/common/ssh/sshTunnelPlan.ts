/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * E14 desktop SSH tunnel plan (system OpenSSH only).
 *
 * D14-3: never put passwords on argv. Authentication is SSH agent / keys /
 * IdentityFile. Brand: CSBU WorkMate. No AGPL.
 */

export const WORKMATE_HOST_URL_SCHEME = 'workmate-host';

export type SshTunnelRequest = {
  /** SSH destination user@host or host */
  remote: string;
  /** Local loopback port the desktop will use for aioncore */
  localPort: number;
  /** Remote Host listen port (usually 25808) */
  remotePort: number;
  /** Optional path to IdentityFile (-i). Never a password. */
  identityFile?: string;
  /** Extra -o options (key=value). Password-related options are rejected. */
  extraOptions?: string[];
};

export type SshTunnelPlan = {
  command: 'ssh';
  args: string[];
  /** Display-only; never includes secrets */
  display: string;
  localUrl: string;
};

const FORBIDDEN_OPTION_PREFIXES = [
  'passwordauthentication=yes',
  'kbdinteractiveauthentication=yes',
  'challengeresponseauthentication=yes',
  'preferredauthentications=password',
  'preferredauthentications=keyboard-interactive',
];

/** True when remote looks like a safe ssh destination (no shell metacharacters). */
export function isSafeSshRemote(remote: string): boolean {
  const trimmed = remote.trim();
  if (!trimmed || trimmed.length > 253) return false;
  // user@host or host; allow dots, hyphens, alphanumerics, optional IPv6 in [] later rejected for simplicity
  return /^[A-Za-z0-9._-]+(@[A-Za-z0-9._-]+)?$/.test(trimmed);
}

export function assertNoPasswordOptions(extraOptions: string[] | undefined): void {
  for (const raw of extraOptions ?? []) {
    const normalized = raw.trim().toLowerCase().replace(/\s+/g, '');
    if (FORBIDDEN_OPTION_PREFIXES.some((p) => normalized === p || normalized.startsWith(`${p},`))) {
      throw new Error('SSH password authentication options are not allowed (D14-3); use keys or ssh-agent');
    }
    if (normalized.includes('password') && normalized.includes('yes')) {
      throw new Error('SSH password authentication options are not allowed (D14-3); use keys or ssh-agent');
    }
  }
}

/**
 * Build `ssh -N -L local:127.0.0.1:remotePort remote` argv for system OpenSSH.
 */
export function buildSshTunnelPlan(req: SshTunnelRequest): SshTunnelPlan {
  if (!Number.isInteger(req.localPort) || req.localPort < 1 || req.localPort > 65535) {
    throw new Error('localPort must be an integer 1–65535');
  }
  if (!Number.isInteger(req.remotePort) || req.remotePort < 1 || req.remotePort > 65535) {
    throw new Error('remotePort must be an integer 1–65535');
  }
  if (!isSafeSshRemote(req.remote)) {
    throw new Error('remote must be a simple host or user@host');
  }
  assertNoPasswordOptions(req.extraOptions);

  if (req.identityFile) {
    const id = req.identityFile.trim();
    if (!id || id.includes('\0') || /[\n\r]/.test(id)) {
      throw new Error('identityFile path is invalid');
    }
  }

  const forward = `${req.localPort}:127.0.0.1:${req.remotePort}`;
  const args: string[] = ['-N', '-L', forward];

  // Prefer publickey/agent; never BatchMode=no with password prompts in automation.
  args.push('-o', 'BatchMode=yes');
  args.push('-o', 'ExitOnForwardFailure=yes');
  args.push('-o', 'PasswordAuthentication=no');

  for (const opt of req.extraOptions ?? []) {
    args.push('-o', opt);
  }

  if (req.identityFile?.trim()) {
    args.push('-i', req.identityFile.trim());
  }

  args.push(req.remote.trim());

  const display = `ssh ${args.map(shellQuote).join(' ')}`;
  return {
    command: 'ssh',
    args,
    display,
    localUrl: `http://127.0.0.1:${req.localPort}`,
  };
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./:=,@+-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Parse stub URL scheme `workmate-host://user@host[:port]` → tunnel request defaults.
 * Full deep-link handling is a follow-up; this is the shared parser stub (E14-2).
 */
export function parseWorkmateHostUrl(raw: string): Pick<SshTunnelRequest, 'remote' | 'remotePort'> | null {
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith(`${WORKMATE_HOST_URL_SCHEME}://`)) return null;
  let rest = trimmed.slice(`${WORKMATE_HOST_URL_SCHEME}://`.length);
  // drop path/query
  rest = rest.split(/[/?#]/)[0] ?? '';
  if (!rest) return null;

  let remotePort = 25808;
  const colon = rest.lastIndexOf(':');
  let remote = rest;
  if (colon > 0 && !rest.includes('@', colon)) {
    // host:port (user@host:port also OK when colon after @)
  }
  const portMatch = rest.match(/^(.*):(\d{1,5})$/);
  if (portMatch) {
    remote = portMatch[1];
    remotePort = Number(portMatch[2]);
    if (remotePort < 1 || remotePort > 65535) return null;
  }
  if (!isSafeSshRemote(remote)) return null;
  return { remote, remotePort };
}
