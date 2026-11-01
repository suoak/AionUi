/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Desktop safeStorage mirror of the backend storage-encryption root (M8 E12-6). */
export type EncryptionRootState =
  /** Keychain copy exists and matches the database secret. */
  | 'keychain'
  /** Keychain copy was created (or re-created) from the database secret this launch. */
  | 'migrated'
  /** The database has no secret yet (first boot); the copy is made next launch. */
  | 'pending'
  /** safeStorage cannot protect data on this system; nothing is sealed or sent. */
  | 'unavailable'
  /** An unexpected error; nothing is sent and the backend uses its database secret. */
  | 'error'
  /** No backend start has resolved the state yet. */
  | 'unknown';

export type EncryptionRootStatus = {
  state: EncryptionRootState;
  /** True when a previous keychain copy did not match and was moved aside. */
  replacedStaleCopy?: boolean;
  /** safeStorage backend on Linux (e.g. gnome_libsecret, basic_text). */
  storageBackend?: string;
  checkedAt: number;
};
