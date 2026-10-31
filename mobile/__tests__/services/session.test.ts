import * as SecureStore from 'expo-secure-store';
import {
  CONNECTION_STORAGE_KEY,
  parseStoredConnection,
  restoreConnection,
  saveConnection,
  type StoredConnection,
} from '@/src/services/session';

const device: StoredConnection = {
  host: '192.168.1.5',
  port: '25808',
  token: 'wmd_token',
  secure: false,
  deviceId: 'dev-1',
  authKind: 'device',
};

describe('parseStoredConnection', () => {
  it('returns none when nothing is stored', () => {
    expect(parseStoredConnection(null)).toEqual({ kind: 'none' });
  });

  it('accepts a paired device config', () => {
    expect(parseStoredConnection(JSON.stringify(device))).toEqual({ kind: 'device', connection: device });
  });

  it('discards a legacy full-JWT config', () => {
    const legacy = JSON.stringify({ host: 'h', port: '1', token: 'eyJhbGciOi.jwt' });
    expect(parseStoredConnection(legacy)).toEqual({ kind: 'discarded_legacy' });
  });

  it('discards a device token without device id, and garbage', () => {
    expect(parseStoredConnection(JSON.stringify({ ...device, deviceId: '' })).kind).toBe('discarded_legacy');
    expect(parseStoredConnection('{not json').kind).toBe('discarded_legacy');
  });
});

describe('restoreConnection / saveConnection', () => {
  const getItem = SecureStore.getItemAsync as jest.Mock;
  const setItem = SecureStore.setItemAsync as jest.Mock;
  const deleteItem = SecureStore.deleteItemAsync as jest.Mock;

  beforeEach(() => {
    getItem.mockReset();
    setItem.mockReset().mockResolvedValue(undefined);
    deleteItem.mockReset().mockResolvedValue(undefined);
  });

  it('stores the device token in SecureStore', async () => {
    await saveConnection(device);
    expect(setItem).toHaveBeenCalledWith(CONNECTION_STORAGE_KEY, JSON.stringify(device));
  });

  it('restores a device config without clearing it', async () => {
    getItem.mockResolvedValue(JSON.stringify(device));
    await expect(restoreConnection()).resolves.toEqual({ kind: 'device', connection: device });
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it('clears a legacy config on restore', async () => {
    getItem.mockResolvedValue(JSON.stringify({ host: 'h', port: '1', token: 'jwt' }));
    await expect(restoreConnection()).resolves.toEqual({ kind: 'discarded_legacy' });
    expect(deleteItem).toHaveBeenCalledWith(CONNECTION_STORAGE_KEY);
  });

  it('treats an unreadable keychain as not paired', async () => {
    getItem.mockRejectedValue(new Error('keychain locked'));
    await expect(restoreConnection()).resolves.toEqual({ kind: 'none' });
  });
});
