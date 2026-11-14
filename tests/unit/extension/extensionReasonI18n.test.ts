/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { EXTENSION_REASON_CODES } from '@/renderer/extensions/reasonCodes';
import enUS from '@/renderer/services/i18n/locales/en-US/common.json';
import zhCN from '@/renderer/services/i18n/locales/zh-CN/common.json';

function assertHintMap(label: string, map: Record<string, unknown>) {
  expect(map, `${label} extensionReasonCodes`).toBeTypeOf('object');
  for (const code of EXTENSION_REASON_CODES) {
    const value = map[code];
    expect(typeof value, `${label} missing or empty hint for ${code}`).toBe('string');
    expect(String(value).trim().length, `${label} empty hint for ${code}`).toBeGreaterThan(0);
    const lower = String(value).toLowerCase();
    expect(lower.includes('/tmp') || lower.includes('sha256') || lower.includes('sha-256')).toBe(false);
  }
}

describe('extension reason-code i18n coverage', () => {
  it('has a non-empty en-US and zh-CN hint for every catalogue code', () => {
    assertHintMap('en-US', enUS.extensionReasonCodes as Record<string, unknown>);
    assertHintMap('zh-CN', zhCN.extensionReasonCodes as Record<string, unknown>);
    expect(
      Object.keys(enUS.extensionReasonCodes)
        .filter((key) => key !== 'supportCode')
        .toSorted()
    ).toEqual([...EXTENSION_REASON_CODES].toSorted());
    expect(
      Object.keys(zhCN.extensionReasonCodes)
        .filter((key) => key !== 'supportCode')
        .toSorted()
    ).toEqual([...EXTENSION_REASON_CODES].toSorted());
  });
});
