/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INHERIT_MCP_COPY_KEYS,
  MCP_ALLOWLIST_CHIP_KEY,
  mcpPolicyChip,
  mcpPolicyChipKey,
} from '@/renderer/pages/agent-center/mcpPolicyCopy';

const localesDir = path.resolve(__dirname, '../../../packages/desktop/src/renderer/services/i18n/locales');

const readAgent = (locale: string) =>
  JSON.parse(fs.readFileSync(path.join(localesDir, locale, 'agent.json'), 'utf8')) as Record<string, unknown>;

const lookup = (obj: Record<string, unknown>, dotted: string): string => {
  const parts = dotted.replace(/^agent\./, '').split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (typeof cur !== 'object' || cur === null || !(part in cur)) {
      throw new Error(`missing ${dotted}`);
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  if (typeof cur !== 'string') throw new Error(`not a string: ${dotted}`);
  return cur;
};

describe('C-05 inherit MCP policy copy', () => {
  it('exposes i18n keys rather than hard-coded copy', () => {
    expect(mcpPolicyChipKey('allowlist')).toBe(MCP_ALLOWLIST_CHIP_KEY);
    expect(mcpPolicyChipKey('inherit_user_enabled')).toBe(INHERIT_MCP_COPY_KEYS.chip);
    const t = (key: string) => key;
    expect(mcpPolicyChip('allowlist', t)).toBe(MCP_ALLOWLIST_CHIP_KEY);
    expect(mcpPolicyChip('inherit_user_enabled', t)).toBe(INHERIT_MCP_COPY_KEYS.chip);
  });

  it('describes the real behavior (previous session selection), not the globally enabled set', () => {
    for (const locale of ['en-US', 'zh-CN']) {
      const json = readAgent(locale);
      const texts = Object.values(INHERIT_MCP_COPY_KEYS).map((key) => lookup(json, key));
      for (const text of texts) {
        if (locale === 'zh-CN') {
          expect(text).toContain('沿用上次');
        } else {
          expect(text.toLowerCase()).toMatch(/previous|last/);
        }
        expect(text).not.toContain('已启用');
        expect(text).not.toContain('继承用户');
        expect(text.toLowerCase()).not.toMatch(/globally enabled|inherit the user/);
      }
    }
  });
});
