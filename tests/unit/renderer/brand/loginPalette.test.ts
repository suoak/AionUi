/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/common/theme/contrast';

const css = readFileSync(
  resolve(__dirname, '../../../../packages/desktop/src/renderer/pages/login/LoginPage.css'),
  'utf8'
);

function varsAfter(marker: string): Record<string, string> {
  const start = css.indexOf(marker);
  const body = css.slice(start, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/(--login-[\w-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)) vars[m[1]] = m[2];
  return vars;
}

const palettes = {
  light: varsAfter('.login-page {'),
  dark: varsAfter('@media (prefers-color-scheme: dark)'),
};

describe.each(Object.entries(palettes))('login %s palette (3.0 V13)', (_name, v) => {
  it.each(['--login-text', '--login-text-2', '--login-text-3'])('%s passes AA on the card and canvas', (key) => {
    expect(contrastRatio(v[key], v['--login-card'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(v[key], v['--login-canvas'])).toBeGreaterThanOrEqual(4.5);
  });

  it('the sign-in button label passes AA', () => {
    expect(contrastRatio(v['--login-on-accent'], v['--login-accent'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(v['--login-on-accent'], v['--login-accent-hover'])).toBeGreaterThanOrEqual(4.5);
  });

  it('uses no gradient title or marketing footer', () => {
    expect(css).not.toContain('background-clip: text');
    expect(css).not.toContain('login-page__footer');
  });
});
