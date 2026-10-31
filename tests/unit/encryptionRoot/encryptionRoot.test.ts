/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  ENCRYPTION_ROOT_FILE,
  resolveEncryptionRoot,
  type EncryptionRootDeps,
  type SafeStorageLike,
} from '@process/services/encryptionRoot/encryptionRoot';

const USER_DATA = '/user-data';
const FILE = `${USER_DATA}/${ENCRYPTION_ROOT_FILE}`;

/** Reversible fake "seal" so tests can tell sealed bytes from plaintext. */
function fakeSafeStorage(overrides: Partial<SafeStorageLike> = {}): SafeStorageLike {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (text) => Buffer.from(`sealed:${text}`),
    decryptString: (buf) => {
      const raw = buf.toString();
      if (!raw.startsWith('sealed:')) throw new Error('not sealed by this keychain');
      return raw.slice('sealed:'.length);
    },
    ...overrides,
  };
}

function memoryFs(initial: Record<string, Buffer> = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    fs: {
      existsSync: vi.fn((p: unknown) => files.has(String(p))),
      readFileSync: vi.fn((p: unknown) => {
        const value = files.get(String(p));
        if (!value) throw new Error('ENOENT');
        return value;
      }),
      writeFileSync: vi.fn((p: unknown, data: unknown) => {
        files.set(String(p), Buffer.from(data as Buffer));
      }),
      renameSync: vi.fn((from: unknown, to: unknown) => {
        const value = files.get(String(from));
        if (!value) throw new Error('ENOENT');
        files.delete(String(from));
        files.set(String(to), value);
      }),
    },
  };
}

function deps(overrides: Partial<EncryptionRootDeps> & { fs?: EncryptionRootDeps['fs'] }): EncryptionRootDeps {
  return {
    safeStorage: fakeSafeStorage(),
    platform: 'darwin',
    userDataPath: USER_DATA,
    readDatabaseSecret: () => 'db-secret',
    now: () => 1000,
    ...overrides,
  } as EncryptionRootDeps;
}

describe('resolveEncryptionRoot', () => {
  it('migrates the database secret into a sealed keychain file on first run', () => {
    const { fs, files } = memoryFs();
    const result = resolveEncryptionRoot(deps({ fs: fs as unknown as EncryptionRootDeps['fs'] }));
    expect(result.root).toBe('db-secret');
    expect(result.status.state).toBe('migrated');
    expect(files.get(FILE)?.toString()).toBe('sealed:db-secret');
    expect(fs.writeFileSync).toHaveBeenCalledWith(`${FILE}.tmp`, expect.anything(), { mode: 0o600 });
  });

  it('uses the keychain copy when it matches the database secret', () => {
    const { fs } = memoryFs({ [FILE]: Buffer.from('sealed:db-secret') });
    const result = resolveEncryptionRoot(deps({ fs: fs as unknown as EncryptionRootDeps['fs'] }));
    expect(result).toEqual({ root: 'db-secret', status: { state: 'keychain', checkedAt: 1000 } });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('keeps the database authoritative on a mismatch and moves the stale copy aside', () => {
    const { fs, files } = memoryFs({ [FILE]: Buffer.from('sealed:old-secret') });
    const result = resolveEncryptionRoot(deps({ fs: fs as unknown as EncryptionRootDeps['fs'] }));
    expect(result.root).toBe('db-secret');
    expect(result.status).toMatchObject({ state: 'migrated', replacedStaleCopy: true });
    expect(files.get(`${FILE}.stale-1000`)?.toString()).toBe('sealed:old-secret');
    expect(files.get(FILE)?.toString()).toBe('sealed:db-secret');
  });

  it('treats an unreadable keychain copy as stale', () => {
    const { fs, files } = memoryFs({ [FILE]: Buffer.from('garbage') });
    const result = resolveEncryptionRoot(deps({ fs: fs as unknown as EncryptionRootDeps['fs'] }));
    expect(result.status).toMatchObject({ state: 'migrated', replacedStaleCopy: true });
    expect(files.has(`${FILE}.stale-1000`)).toBe(true);
  });

  it('waits for the backend to seed the secret on a fresh install', () => {
    const { fs, files } = memoryFs();
    const result = resolveEncryptionRoot(
      deps({ fs: fs as unknown as EncryptionRootDeps['fs'], readDatabaseSecret: () => null })
    );
    expect(result.root).toBeNull();
    expect(result.status.state).toBe('pending');
    expect(files.size).toBe(0);
  });

  it('does nothing when safeStorage is unavailable', () => {
    const { fs, files } = memoryFs();
    const readDatabaseSecret = vi.fn(() => 'db-secret');
    const result = resolveEncryptionRoot(
      deps({
        fs: fs as unknown as EncryptionRootDeps['fs'],
        safeStorage: fakeSafeStorage({ isEncryptionAvailable: () => false }),
        readDatabaseSecret,
      })
    );
    expect(result.root).toBeNull();
    expect(result.status.state).toBe('unavailable');
    expect(readDatabaseSecret).not.toHaveBeenCalled();
    expect(files.size).toBe(0);
  });

  it('treats the Linux basic_text backend as unavailable', () => {
    const { fs } = memoryFs();
    const result = resolveEncryptionRoot(
      deps({
        fs: fs as unknown as EncryptionRootDeps['fs'],
        platform: 'linux',
        safeStorage: fakeSafeStorage({ getSelectedStorageBackend: () => 'basic_text' }),
      })
    );
    expect(result.root).toBeNull();
    expect(result.status).toMatchObject({ state: 'unavailable', storageBackend: 'basic_text' });
  });

  it('accepts a real Linux keyring backend', () => {
    const { fs } = memoryFs();
    const result = resolveEncryptionRoot(
      deps({
        fs: fs as unknown as EncryptionRootDeps['fs'],
        platform: 'linux',
        safeStorage: fakeSafeStorage({ getSelectedStorageBackend: () => 'gnome_libsecret' }),
      })
    );
    expect(result.root).toBe('db-secret');
    expect(result.status).toMatchObject({ state: 'migrated', storageBackend: 'gnome_libsecret' });
  });

  it('never sends a value when sealing fails or does not round-trip', () => {
    const { fs, files } = memoryFs();
    const throwing = resolveEncryptionRoot(
      deps({
        fs: fs as unknown as EncryptionRootDeps['fs'],
        safeStorage: fakeSafeStorage({
          encryptString: () => {
            throw new Error('keychain locked');
          },
        }),
      })
    );
    expect(throwing).toMatchObject({ root: null, status: { state: 'error' } });

    const lossy = resolveEncryptionRoot(
      deps({
        fs: fs as unknown as EncryptionRootDeps['fs'],
        safeStorage: fakeSafeStorage({ decryptString: () => 'something-else' }),
      })
    );
    expect(lossy).toMatchObject({ root: null, status: { state: 'error' } });
    expect(files.size).toBe(0);
  });

  it('refuses a secret that cannot be framed as one stdin line', () => {
    const { fs } = memoryFs();
    const result = resolveEncryptionRoot(
      deps({ fs: fs as unknown as EncryptionRootDeps['fs'], readDatabaseSecret: () => 'a\nb' })
    );
    expect(result).toMatchObject({ root: null, status: { state: 'error' } });
  });
});
