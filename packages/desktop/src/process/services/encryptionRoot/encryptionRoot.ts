/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M8 E12-6: OS-keychain (Electron safeStorage) mirror of the backend's
 * storage-encryption root.
 *
 * The source of truth stays the backend database column
 * `users.encryption_secret`; this module never generates a key and never
 * modifies or clears that column (decision D12-5). It only:
 *
 * 1. reads the column read-only before the backend starts,
 * 2. seals a copy with safeStorage into `userData/encryption-root.bin`, and
 * 3. hands the unsealed value to the backend over stdin when it still matches
 *    the column, so the backend can verify the keychain copy.
 *
 * Fresh installs have no column value until the backend's first boot seeds
 * it; the copy is made on the next launch. If safeStorage is unavailable
 * (for example Linux without a keyring) nothing is sealed or sent and the
 * backend keeps its current behaviour.
 */

import * as nodeFs from 'node:fs';
import * as path from 'node:path';
import type { EncryptionRootState, EncryptionRootStatus } from '@/common/types/encryptionRoot';

export type { EncryptionRootState, EncryptionRootStatus };

export const ENCRYPTION_ROOT_FILE = 'encryption-root.bin';

export type SafeStorageLike = {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
  getSelectedStorageBackend?: () => string;
};

type FsLike = Pick<typeof nodeFs, 'existsSync' | 'readFileSync' | 'writeFileSync' | 'renameSync'>;

export type EncryptionRootDeps = {
  safeStorage: SafeStorageLike;
  platform: NodeJS.Platform;
  userDataPath: string;
  /** Read-only lookup of `users.encryption_secret`; null when absent or unreadable. */
  readDatabaseSecret: () => string | null;
  fs?: FsLike;
  now?: () => number;
};

export type EncryptionRootResult = {
  /** Value to hand to the backend, or null to send nothing. */
  root: string | null;
  status: EncryptionRootStatus;
};

/** Linux backends that do not actually protect data with an OS secret store. */
const INSECURE_LINUX_BACKENDS = new Set(['basic_text', 'unknown']);

function storageBackendOf(deps: EncryptionRootDeps): string | undefined {
  if (deps.platform !== 'linux' || !deps.safeStorage.getSelectedStorageBackend) return undefined;
  try {
    return deps.safeStorage.getSelectedStorageBackend();
  } catch {
    return 'unknown';
  }
}

export function resolveEncryptionRoot(deps: EncryptionRootDeps): EncryptionRootResult {
  const fs = deps.fs ?? nodeFs;
  const now = deps.now ?? Date.now;
  const status = (state: EncryptionRootState, extra: Partial<EncryptionRootStatus> = {}): EncryptionRootStatus => ({
    state,
    checkedAt: now(),
    ...extra,
  });

  try {
    // isEncryptionAvailable() first: on Linux the selected backend is only
    // known after it has been initialised.
    const available = deps.safeStorage.isEncryptionAvailable();
    const storageBackend = storageBackendOf(deps);
    if (!available || (storageBackend !== undefined && INSECURE_LINUX_BACKENDS.has(storageBackend))) {
      return { root: null, status: status('unavailable', { storageBackend }) };
    }

    const dbSecret = deps.readDatabaseSecret();
    if (!dbSecret) return { root: null, status: status('pending', { storageBackend }) };
    if (/[\r\n]/.test(dbSecret)) return { root: null, status: status('error', { storageBackend }) };

    const file = path.join(deps.userDataPath, ENCRYPTION_ROOT_FILE);
    let replacedStaleCopy = false;
    if (fs.existsSync(file)) {
      let sealedValue: string | null = null;
      try {
        sealedValue = deps.safeStorage.decryptString(fs.readFileSync(file));
      } catch {
        sealedValue = null;
      }
      if (sealedValue === dbSecret) {
        return { root: dbSecret, status: status('keychain', { storageBackend }) };
      }
      // The database was restored, swapped, or its secret rotated: the
      // database wins. Keep the old copy beside it instead of deleting it.
      fs.renameSync(file, `${file}.stale-${now()}`);
      replacedStaleCopy = true;
    }

    const sealed = deps.safeStorage.encryptString(dbSecret);
    if (deps.safeStorage.decryptString(sealed) !== dbSecret) {
      return { root: null, status: status('error', { storageBackend, replacedStaleCopy }) };
    }
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, sealed, { mode: 0o600 });
    fs.renameSync(tmp, file);
    return { root: dbSecret, status: status('migrated', { storageBackend, replacedStaleCopy }) };
  } catch {
    return { root: null, status: status('error') };
  }
}

let lastStatus: EncryptionRootStatus = { state: 'unknown', checkedAt: 0 };

export function recordEncryptionRootStatus(status: EncryptionRootStatus): void {
  lastStatus = status;
}

export function getEncryptionRootStatus(): EncryptionRootStatus {
  return lastStatus;
}
