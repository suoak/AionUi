/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WM_CONTRAST_MIN, WM_SEMANTIC_TOKENS } from '@/common/theme/designTokens';
import { contrastRatio } from '@/common/theme/contrast';
import { CLASSIC_DARK_THEME_ID, CLASSIC_LIGHT_THEME_ID, DARK_THEME_ID, LIGHT_THEME_ID } from '@/common/theme/constants';

vi.mock('@renderer/pages/settings/AppearanceSettings/themeCovers', () => ({
  misakaMikotoCover: 'a.png',
  helloKittyCover: 'b.png',
  retroWindowsCover: 'c.png',
  y2kJpCover: 'd.png',
  retromaObsidianBookCover: 'e.png',
}));

const THEME_DIR = resolve(__dirname, '../../../../packages/desktop/src/renderer/theme/default');
const SCHEME_CSS = resolve(
  __dirname,
  '../../../../packages/desktop/src/renderer/styles/themes/default-color-scheme.css'
);

/** Collect `--name: value;` declarations from the first block matching `selector {`. */
function readVars(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[match[1]] = match[2].trim();
  return vars;
}

const themes = {
  ember: readVars(readFileSync(resolve(THEME_DIR, 'ember.css'), 'utf8'), ':root'),
  dusk: readVars(readFileSync(resolve(THEME_DIR, 'dusk.css'), 'utf8'), ':root'),
};

const SURFACES = ['--wm-surface-canvas', '--wm-surface-sidebar', '--wm-surface-panel', '--wm-surface-raised'];
const TEXT = ['--wm-text-primary', '--wm-text-secondary', '--wm-text-tertiary'];
const STATUS = ['--wm-status-needs-you', '--wm-status-done', '--wm-status-failed', '--wm-status-working'];

describe.each(Object.entries(themes))('%s theme', (_name, vars) => {
  it('defines every --wm-* semantic token with a hex colour', () => {
    for (const { key } of WM_SEMANTIC_TOKENS) {
      expect(vars[key], key).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(TEXT)('%s passes WCAG AA on every surface', (text) => {
    for (const surface of SURFACES) {
      expect(contrastRatio(vars[text], vars[surface]), `${text} on ${surface}`).toBeGreaterThanOrEqual(
        WM_CONTRAST_MIN.text
      );
    }
  });

  it('accent text is readable on canvas and raised surfaces', () => {
    for (const surface of ['--wm-surface-canvas', '--wm-surface-raised']) {
      expect(contrastRatio(vars['--wm-accent'], vars[surface])).toBeGreaterThanOrEqual(WM_CONTRAST_MIN.text);
    }
  });

  it('text on an accent fill passes AA', () => {
    expect(contrastRatio(vars['--wm-text-on-accent'], vars['--wm-accent'])).toBeGreaterThanOrEqual(
      WM_CONTRAST_MIN.text
    );
  });

  it('strong borders and status glyphs pass the 3:1 non-text minimum', () => {
    for (const surface of SURFACES) {
      expect(contrastRatio(vars['--wm-border-strong'], vars[surface]), `border on ${surface}`).toBeGreaterThanOrEqual(
        WM_CONTRAST_MIN.nonText
      );
      for (const status of STATUS) {
        expect(contrastRatio(vars[status], vars[surface]), `${status} on ${surface}`).toBeGreaterThanOrEqual(
          WM_CONTRAST_MIN.nonText
        );
      }
    }
  });

  it('keeps the accent the user approved', () => {
    expect(vars['--wm-accent']).toBe(_name === 'ember' ? '#b4410f' : '#c38bff');
  });
});

describe('classic palette tertiary text', () => {
  const css = readFileSync(SCHEME_CSS, 'utf8');
  const light = readVars(css, "[data-color-scheme='default']");
  const dark = readVars(css, "[data-color-scheme='default'][data-theme='dark']");

  it('fixes the old --bg-6 tertiary contrast in both appearances', () => {
    expect(contrastRatio(light['--wm-text-tertiary'], light['--bg-base'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light['--wm-text-tertiary'], light['--bg-1'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark['--wm-text-tertiary'], dark['--bg-base'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark['--wm-text-tertiary'], dark['--bg-1'])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('built-in theme list', () => {
  it('makes Ember / Dusk the default ids and keeps the classic pair and seven decorative presets', async () => {
    const { BUILTIN_THEMES, DECORATIVE_THEME_IDS, PRIMARY_BUILTIN_THEME_IDS } =
      await import('@renderer/theme/builtinThemes');
    const byId = new Map(BUILTIN_THEMES.map((t) => [t.id, t]));
    // `?raw` CSS is stubbed to '' under vitest; the files themselves are checked above.
    expect(typeof byId.get(LIGHT_THEME_ID)?.css).toBe('string');
    expect(typeof byId.get(DARK_THEME_ID)?.css).toBe('string');
    expect(byId.get(LIGHT_THEME_ID)?.appearance).toBe('light');
    expect(byId.get(DARK_THEME_ID)?.appearance).toBe('dark');
    expect(byId.get(CLASSIC_LIGHT_THEME_ID)?.css).toBeUndefined();
    expect(byId.get(CLASSIC_DARK_THEME_ID)?.appearance).toBe('dark');
    expect(PRIMARY_BUILTIN_THEME_IDS.size).toBe(4);
    expect(DECORATIVE_THEME_IDS.size).toBe(7);
    for (const id of PRIMARY_BUILTIN_THEME_IDS) expect(DECORATIVE_THEME_IDS.has(id)).toBe(false);
  });
});
