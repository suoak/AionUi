/**
 * Two-step device pairing against CSBU WorkMate Core (M8 E9-4).
 *
 * 1. The desktop shows a QR code `{base}/pair-device?token={qr_token}` and a
 *    6-digit code. The phone scans (or pastes) the link and calls
 *    `POST /api/auth/devices/pair/start`.
 * 2. The user types the 6-digit code; the phone calls
 *    `POST /api/auth/devices/pair/confirm` and receives a long-lived device
 *    token (`wmd_…`) that is stored in SecureStore.
 *
 * The legacy `/qr-login` link (full JWT login) is for the browser WebUI only.
 */
import axios from 'axios';

export const DEVICE_TOKEN_PREFIX = 'wmd_';
export const PAIRING_CODE_LENGTH = 6;
const REQUEST_TIMEOUT_MS = 15000;

export type PairingPlatform = 'ios' | 'android' | 'web';

export type ParsedPairingLink =
  | { kind: 'pairing'; host: string; port: string; secure: boolean; qrToken: string }
  | { kind: 'legacy_qr_login' }
  | { kind: 'invalid' };

export type PairingStart = { pairingId: string; expiresAt: number };

export type PairedDevice = {
  deviceId: string;
  deviceToken: string;
  name: string;
  platform: string;
  scopes: string[];
};

export type PairingErrorKind =
  'qr_invalid' | 'code_invalid' | 'closed' | 'device_limit' | 'invalid_request' | 'network' | 'unknown';

export class PairingError extends Error {
  constructor(
    public readonly kind: PairingErrorKind,
    public readonly details: { attemptsLeft?: number; maxDevices?: number; status?: string } = {}
  ) {
    super(`pairing failed: ${kind}`);
    this.name = 'PairingError';
  }
}

export function isDeviceToken(token: string | null | undefined): boolean {
  return (
    typeof token === 'string' && token.startsWith(DEVICE_TOKEN_PREFIX) && token.length > DEVICE_TOKEN_PREFIX.length
  );
}

/** Parse a scanned or pasted desktop link. */
export function parsePairingLink(raw: string): ParsedPairingLink {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { kind: 'invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'invalid' };
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/qr-login') return { kind: 'legacy_qr_login' };
  if (path !== '/pair-device') return { kind: 'invalid' };
  const qrToken = url.searchParams.get('token');
  if (!qrToken || !url.hostname) return { kind: 'invalid' };
  const secure = url.protocol === 'https:';
  return {
    kind: 'pairing',
    host: url.hostname,
    port: url.port || (secure ? '443' : '80'),
    secure,
    qrToken,
  };
}

/** Accept exactly six ASCII digits (spaces are ignored). */
export function normalizePairingCode(input: string): string | null {
  const code = input.replace(/\s+/g, '');
  return new RegExp(`^[0-9]{${PAIRING_CODE_LENGTH}}$`).test(code) ? code : null;
}

/** Core validates the name; keep it short and printable. */
export function sanitizeDeviceName(name: string | null | undefined, fallback: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = (name ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 64);
  return cleaned || fallback;
}

export function toPairingPlatform(os: string): PairingPlatform {
  return os === 'ios' || os === 'android' ? os : 'web';
}

export function serverBaseUrl(host: string, port: string, secure = false): string {
  return `${secure ? 'https' : 'http'}://${host}:${port}`;
}

export function classifyPairingError(error: unknown): PairingError {
  if (error instanceof PairingError) return error;
  if (!axios.isAxiosError(error)) return new PairingError('unknown');
  if (!error.response) return new PairingError('network');
  const status = error.response.status;
  const body = (error.response.data ?? {}) as { code?: string; details?: Record<string, unknown> };
  const details = body.details ?? {};
  switch (body.code) {
    case 'DEVICE_PAIRING_QR_INVALID':
      return new PairingError('qr_invalid');
    case 'DEVICE_PAIRING_CODE_INVALID':
      return new PairingError('code_invalid', {
        attemptsLeft: typeof details.attempts_left === 'number' ? details.attempts_left : undefined,
      });
    case 'DEVICE_PAIRING_CLOSED':
      return new PairingError('closed', { status: typeof details.status === 'string' ? details.status : undefined });
    case 'DEVICE_LIMIT_REACHED':
      return new PairingError('device_limit', {
        maxDevices: typeof details.max_devices === 'number' ? details.max_devices : undefined,
      });
    default:
      break;
  }
  if (status === 400) return new PairingError('invalid_request');
  if (status === 410) return new PairingError('closed');
  return new PairingError('unknown');
}

function unwrap<T>(body: unknown): T {
  const envelope = body as { success?: boolean; data?: T };
  if (envelope && typeof envelope === 'object' && 'data' in envelope && envelope.success !== false) {
    return envelope.data as T;
  }
  return body as T;
}

export async function startPairing(
  baseUrl: string,
  qrToken: string,
  deviceName: string,
  platform: PairingPlatform
): Promise<PairingStart> {
  try {
    const res = await axios.post(
      `${baseUrl}/api/auth/devices/pair/start`,
      { qr_token: qrToken, device_name: deviceName, platform },
      { timeout: REQUEST_TIMEOUT_MS }
    );
    const data = unwrap<{ pairing_id?: string; expires_at?: number }>(res.data);
    if (!data?.pairing_id) throw new PairingError('unknown');
    return { pairingId: data.pairing_id, expiresAt: Number(data.expires_at ?? 0) };
  } catch (error) {
    throw classifyPairingError(error);
  }
}

export async function confirmPairing(baseUrl: string, pairingId: string, code: string): Promise<PairedDevice> {
  try {
    const res = await axios.post(
      `${baseUrl}/api/auth/devices/pair/confirm`,
      { pairing_id: pairingId, code },
      { timeout: REQUEST_TIMEOUT_MS }
    );
    const data = unwrap<{
      device_id?: string;
      device_token?: string;
      name?: string;
      platform?: string;
      scopes?: string[];
    }>(res.data);
    if (!data?.device_id || !isDeviceToken(data.device_token)) throw new PairingError('unknown');
    return {
      deviceId: data.device_id,
      deviceToken: data.device_token as string,
      name: data.name ?? '',
      platform: data.platform ?? '',
      scopes: Array.isArray(data.scopes) ? data.scopes : [],
    };
  } catch (error) {
    throw classifyPairingError(error);
  }
}
