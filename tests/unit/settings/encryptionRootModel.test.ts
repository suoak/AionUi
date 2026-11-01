/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getEncryptionRootHint } from '@/renderer/pages/settings/GovernanceSettings/encryptionRootModel';

describe('getEncryptionRootHint', () => {
  it('returns null without a status or for unknown', () => {
    expect(getEncryptionRootHint(null)).toBeNull();
    expect(getEncryptionRootHint(undefined)).toBeNull();
    expect(getEncryptionRootHint({ state: 'unknown', checkedAt: 1 })).toBeNull();
  });

  it('maps each state to an alert type and message', () => {
    expect(getEncryptionRootHint({ state: 'keychain', checkedAt: 1 })).toEqual({
      type: 'success',
      messageKey: 'settings.governance.encryptionRoot.keychain',
      staleNoteKey: undefined,
    });
    expect(getEncryptionRootHint({ state: 'migrated', checkedAt: 1 })?.type).toBe('success');
    expect(getEncryptionRootHint({ state: 'pending', checkedAt: 1 })).toEqual({
      type: 'info',
      messageKey: 'settings.governance.encryptionRoot.pending',
    });
    expect(getEncryptionRootHint({ state: 'unavailable', checkedAt: 1, storageBackend: 'basic_text' })).toEqual({
      type: 'warning',
      messageKey: 'settings.governance.encryptionRoot.unavailable',
    });
    expect(getEncryptionRootHint({ state: 'error', checkedAt: 1 })?.messageKey).toBe(
      'settings.governance.encryptionRoot.error'
    );
  });

  it('adds the stale-copy note only for keychain/migrated', () => {
    expect(getEncryptionRootHint({ state: 'migrated', checkedAt: 1, replacedStaleCopy: true })?.staleNoteKey).toBe(
      'settings.governance.encryptionRoot.staleReplaced'
    );
    expect(getEncryptionRootHint({ state: 'pending', checkedAt: 1, replacedStaleCopy: true })?.staleNoteKey).toBe(
      undefined
    );
  });
});
