import axios, { AxiosError, AxiosHeaders } from 'axios';
import {
  PairingError,
  classifyPairingError,
  confirmPairing,
  isDeviceToken,
  normalizePairingCode,
  parsePairingLink,
  sanitizeDeviceName,
  serverBaseUrl,
  startPairing,
  toPairingPlatform,
} from '@/src/services/pairing';

function httpError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('request failed', 'ERR_BAD_RESPONSE', config, null, {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  });
}

describe('parsePairingLink', () => {
  it('parses the desktop pair-device link', () => {
    expect(parsePairingLink('http://192.168.1.5:25808/pair-device?token=qr123')).toEqual({
      kind: 'pairing',
      host: '192.168.1.5',
      port: '25808',
      secure: false,
      qrToken: 'qr123',
    });
  });

  it('supports https with the default port', () => {
    expect(parsePairingLink('  https://workmate.example.com/pair-device/?token=abc  ')).toEqual({
      kind: 'pairing',
      host: 'workmate.example.com',
      port: '443',
      secure: true,
      qrToken: 'abc',
    });
  });

  it('recognises the WebUI qr-login link as legacy', () => {
    expect(parsePairingLink('http://10.0.0.2:25808/qr-login?token=jwt').kind).toBe('legacy_qr_login');
  });

  it.each(['', 'not a url', 'ftp://h/pair-device?token=x', 'http://h:1/pair-device', 'http://h:1/other?token=x'])(
    'rejects %p',
    (raw) => {
      expect(parsePairingLink(raw).kind).toBe('invalid');
    }
  );
});

describe('small helpers', () => {
  it('normalizes six-digit codes only', () => {
    expect(normalizePairingCode('123 456')).toBe('123456');
    expect(normalizePairingCode('12345')).toBeNull();
    expect(normalizePairingCode('1234567')).toBeNull();
    expect(normalizePairingCode('12a456')).toBeNull();
  });

  it('recognises device tokens', () => {
    expect(isDeviceToken('wmd_abc')).toBe(true);
    expect(isDeviceToken('wmd_')).toBe(false);
    expect(isDeviceToken('eyJhbGciOi.jwt')).toBe(false);
    expect(isDeviceToken(null)).toBe(false);
  });

  it('sanitizes the device name', () => {
    expect(sanitizeDeviceName('  My\u0007 Phone ', 'fallback')).toBe('My Phone');
    expect(sanitizeDeviceName('', 'fallback')).toBe('fallback');
    expect(sanitizeDeviceName(null, 'fallback')).toBe('fallback');
    expect(sanitizeDeviceName('x'.repeat(100), 'f')).toHaveLength(64);
  });

  it('maps platforms and builds base URLs', () => {
    expect(toPairingPlatform('ios')).toBe('ios');
    expect(toPairingPlatform('android')).toBe('android');
    expect(toPairingPlatform('windows')).toBe('web');
    expect(serverBaseUrl('h', '1')).toBe('http://h:1');
    expect(serverBaseUrl('h', '443', true)).toBe('https://h:443');
  });
});

describe('classifyPairingError', () => {
  it('maps Core error codes', () => {
    expect(classifyPairingError(httpError(401, { code: 'DEVICE_PAIRING_QR_INVALID' })).kind).toBe('qr_invalid');
    const code = classifyPairingError(
      httpError(401, { code: 'DEVICE_PAIRING_CODE_INVALID', details: { attempts_left: 2 } })
    );
    expect(code.kind).toBe('code_invalid');
    expect(code.details.attemptsLeft).toBe(2);
    expect(
      classifyPairingError(httpError(410, { code: 'DEVICE_PAIRING_CLOSED', details: { status: 'expired' } }))
    ).toMatchObject({ kind: 'closed', details: { status: 'expired' } });
    expect(
      classifyPairingError(httpError(409, { code: 'DEVICE_LIMIT_REACHED', details: { max_devices: 5 } }))
    ).toMatchObject({ kind: 'device_limit', details: { maxDevices: 5 } });
  });

  it('falls back on HTTP status, network and unknown errors', () => {
    expect(classifyPairingError(httpError(400, {})).kind).toBe('invalid_request');
    expect(classifyPairingError(httpError(410, {})).kind).toBe('closed');
    expect(classifyPairingError(httpError(500, {})).kind).toBe('unknown');
    expect(classifyPairingError(new AxiosError('offline', 'ERR_NETWORK')).kind).toBe('network');
    expect(classifyPairingError(new Error('boom')).kind).toBe('unknown');
    const existing = new PairingError('closed');
    expect(classifyPairingError(existing)).toBe(existing);
  });
});

describe('startPairing / confirmPairing', () => {
  let post: jest.SpyInstance;

  beforeEach(() => {
    post = jest.spyOn(axios, 'post');
  });

  afterEach(() => {
    post.mockRestore();
  });

  it('starts pairing with the QR token, device name and platform', async () => {
    post.mockResolvedValue({ data: { success: true, data: { pairing_id: 'p1', expires_at: 1700000000000 } } });
    await expect(startPairing('http://h:1', 'qr', 'Phone', 'ios')).resolves.toEqual({
      pairingId: 'p1',
      expiresAt: 1700000000000,
    });
    expect(post).toHaveBeenCalledWith(
      'http://h:1/api/auth/devices/pair/start',
      { qr_token: 'qr', device_name: 'Phone', platform: 'ios' },
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });

  it('rejects a start response without a pairing id', async () => {
    post.mockResolvedValue({ data: { success: true, data: {} } });
    await expect(startPairing('http://h:1', 'qr', 'Phone', 'ios')).rejects.toMatchObject({ kind: 'unknown' });
  });

  it('confirms the code and returns the device token', async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        data: { device_id: 'd1', device_token: 'wmd_secret', name: 'Phone', platform: 'ios', scopes: ['inbox'] },
      },
    });
    await expect(confirmPairing('http://h:1', 'p1', '123456')).resolves.toEqual({
      deviceId: 'd1',
      deviceToken: 'wmd_secret',
      name: 'Phone',
      platform: 'ios',
      scopes: ['inbox'],
    });
    expect(post).toHaveBeenCalledWith(
      'http://h:1/api/auth/devices/pair/confirm',
      { pairing_id: 'p1', code: '123456' },
      expect.anything()
    );
  });

  it('refuses a non-device token', async () => {
    post.mockResolvedValue({ data: { success: true, data: { device_id: 'd1', device_token: 'eyJ.jwt' } } });
    await expect(confirmPairing('http://h:1', 'p1', '123456')).rejects.toMatchObject({ kind: 'unknown' });
  });

  it('surfaces attempts left for a wrong code', async () => {
    post.mockRejectedValue(httpError(401, { code: 'DEVICE_PAIRING_CODE_INVALID', details: { attempts_left: 4 } }));
    await expect(confirmPairing('http://h:1', 'p1', '000000')).rejects.toMatchObject({
      kind: 'code_invalid',
      details: { attemptsLeft: 4 },
    });
  });
});
