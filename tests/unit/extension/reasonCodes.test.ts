/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  EXTENSION_REASON_CODES,
  collectErrorText,
  findExtensionReasonCode,
  findExtensionReasonCodeIn,
} from '@/renderer/extensions/reasonCodes';

describe('findExtensionReasonCode', () => {
  it('splits on anything other than [a-z0-9_] and takes the first catalogue code', () => {
    expect(findExtensionReasonCode('Signed package install failed: package_invalid')).toBe('package_invalid');
    expect(findExtensionReasonCode('refused (name_reserved_by_builtin)')).toBe('name_reserved_by_builtin');
    expect(
      findExtensionReasonCode(
        'background service start refused: bound_service_runtime_unsupported (bound service must not be started from a path string)'
      )
    ).toBe('bound_service_runtime_unsupported');
    expect(findExtensionReasonCode('Extension asset refused: verified_asset_integrity_mismatch')).toBe(
      'verified_asset_integrity_mismatch'
    );
    expect(findExtensionReasonCode('Theme CSS could not be verified: theme_css_not_utf8')).toBe('theme_css_not_utf8');
    expect(findExtensionReasonCode('integrity_binding_unavailable')).toBe('integrity_binding_unavailable');
  });

  it('returns the first catalogue token when several are present', () => {
    expect(findExtensionReasonCode('package_invalid then curated_not_in_index')).toBe('package_invalid');
  });

  it('ignores tokens that are not catalogue codes and returns null when none match', () => {
    expect(findExtensionReasonCode('Forbidden.')).toBeNull();
    expect(findExtensionReasonCode('not_a_real_code package-invalid PACKAGE_INVALID')).toBeNull();
    expect(findExtensionReasonCode('')).toBeNull();
    expect(findExtensionReasonCode(undefined)).toBeNull();
  });

  it('extracts every catalogue code from a typical backend message', () => {
    for (const code of EXTENSION_REASON_CODES) {
      expect(findExtensionReasonCode(`Signed package install failed: ${code}`)).toBe(code);
      expect(findExtensionReasonCode(`… (${code})`)).toBe(code);
    }
  });
});

describe('collectErrorText / findExtensionReasonCodeIn', () => {
  it('reads hub msg, tool reason, and HTTP error envelopes', () => {
    expect(findExtensionReasonCodeIn({ msg: 'Signed package install failed: curated_signature_invalid' })).toBe(
      'curated_signature_invalid'
    );
    expect(findExtensionReasonCodeIn({ reason: 'handler_integrity_checked' })).toBe('handler_integrity_checked');
    expect(
      findExtensionReasonCodeIn({
        error: 'Forbidden.',
        body: { error: 'Extension asset refused: verified_asset_not_listed' },
      })
    ).toBe('verified_asset_not_listed');

    const err = new Error('Backend POST /api/hub/install failed (200)');
    (err as Error & { backendMessage: string }).backendMessage =
      'background service start refused: bound_service_runner_unavailable (x)';
    expect(findExtensionReasonCodeIn(err)).toBe('bound_service_runner_unavailable');
    expect(collectErrorText({ msg: 'hello' })).toContain('hello');
  });
});
