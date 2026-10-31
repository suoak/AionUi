/**
 * Persisted phone session (M8 E9-4).
 *
 * The phone only keeps a paired device token (`wmd_…`) in SecureStore. A
 * config saved by older builds (full JWT from the WebUI `/qr-login` flow) is
 * discarded on restore so the user pairs the phone properly.
 */
import * as SecureStore from 'expo-secure-store';
import { api } from './api';
import { isDeviceToken } from './pairing';

export const CONNECTION_STORAGE_KEY = 'csbu_workmate_connection';

export type StoredConnection = {
  host: string;
  port: string;
  token: string;
  secure: boolean;
  deviceId: string;
  authKind: 'device';
};

export type RestoreResult =
  { kind: 'none' } | { kind: 'device'; connection: StoredConnection } | { kind: 'discarded_legacy' };

export function parseStoredConnection(raw: string | null): RestoreResult {
  if (!raw) return { kind: 'none' };
  let value: Partial<StoredConnection> & Record<string, unknown>;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: 'discarded_legacy' };
  }
  if (
    !value ||
    typeof value.host !== 'string' ||
    typeof value.port !== 'string' ||
    !isDeviceToken(value.token as string) ||
    typeof value.deviceId !== 'string' ||
    !value.deviceId
  ) {
    return { kind: 'discarded_legacy' };
  }
  return {
    kind: 'device',
    connection: {
      host: value.host,
      port: value.port,
      token: value.token as string,
      secure: value.secure === true,
      deviceId: value.deviceId,
      authKind: 'device',
    },
  };
}

export async function restoreConnection(): Promise<RestoreResult> {
  let raw: string | null = null;
  try {
    raw = await SecureStore.getItemAsync(CONNECTION_STORAGE_KEY);
  } catch {
    return { kind: 'none' };
  }
  const result = parseStoredConnection(raw);
  if (result.kind === 'discarded_legacy') {
    await clearConnection();
  }
  return result;
}

export async function saveConnection(connection: StoredConnection): Promise<void> {
  await SecureStore.setItemAsync(CONNECTION_STORAGE_KEY, JSON.stringify(connection));
}

export async function clearConnection(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CONNECTION_STORAGE_KEY);
  } catch {
    // Nothing stored or keychain unavailable; treat as cleared.
  }
}

export type TokenCheck = 'valid' | 'revoked' | 'unreachable';

/** Ask Core whether the configured device token still works. */
export async function checkDeviceToken(): Promise<TokenCheck> {
  try {
    await api.get('/api/auth/user');
    return 'valid';
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    return status === 401 ? 'revoked' : 'unreachable';
  }
}
