/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeStorage } from 'electron';
import type { EncryptionRootProvider } from '@csbu-workmate/web-host';

/**
 * Backend-launcher hook for the M8 E12-6 keychain mirror. The encryption-root
 * module (and with it the better-sqlite3 native binding) is loaded lazily on
 * the first backend start, so a broken native module can only disable the
 * mirror, never block app startup.
 */
export function createEncryptionRootProvider(getUserDataPath: () => string): EncryptionRootProvider {
  return async (dataDir) => {
    const { readDatabaseEncryptionSecret, recordEncryptionRootStatus, resolveEncryptionRoot } =
      await import('@process/services/encryptionRoot');
    const { root, status } = resolveEncryptionRoot({
      safeStorage,
      platform: process.platform,
      userDataPath: getUserDataPath(),
      readDatabaseSecret: () => readDatabaseEncryptionSecret(dataDir),
    });
    recordEncryptionRootStatus(status);
    console.info(
      `[encryption-root] state=${status.state}${status.storageBackend ? ` backend=${status.storageBackend}` : ''}${
        status.replacedStaleCopy ? ' replacedStaleCopy=true' : ''
      }`
    );
    return root;
  };
}
