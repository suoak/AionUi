/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EncryptionRootStatus } from '@/common/types/encryptionRoot';

export type EncryptionRootHintView = {
  /** Arco Alert type. */
  type: 'success' | 'info' | 'warning';
  /** i18n key under settings.governance.encryptionRoot. */
  messageKey: string;
  /** Extra note when an old keychain copy was moved aside. */
  staleNoteKey?: string;
};

/**
 * Maps the desktop keychain-mirror state (M8 E12-6) to a hint. Returns null when there is
 * nothing useful to say (state not resolved yet, or no status at all).
 */
export function getEncryptionRootHint(status: EncryptionRootStatus | null | undefined): EncryptionRootHintView | null {
  if (!status) return null;
  const staleNoteKey = status.replacedStaleCopy ? 'settings.governance.encryptionRoot.staleReplaced' : undefined;
  switch (status.state) {
    case 'keychain':
      return { type: 'success', messageKey: 'settings.governance.encryptionRoot.keychain', staleNoteKey };
    case 'migrated':
      return { type: 'success', messageKey: 'settings.governance.encryptionRoot.migrated', staleNoteKey };
    case 'pending':
      return { type: 'info', messageKey: 'settings.governance.encryptionRoot.pending' };
    case 'unavailable':
      return { type: 'warning', messageKey: 'settings.governance.encryptionRoot.unavailable' };
    case 'error':
      return { type: 'warning', messageKey: 'settings.governance.encryptionRoot.error' };
    default:
      return null;
  }
}
