/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  WM_FONT_SIZES,
  WM_MOTION,
  WM_RADII,
  WM_SEMANTIC_TOKENS,
  WM_SPACING,
  WM_STATUSES,
  statusColorVar,
} from '@/common/theme/designTokens';
import { contrastRatio, parseHexColor, relativeLuminance } from '@/common/theme/contrast';

describe('design system scales', () => {
  it('keeps the type scale to seven ascending steps', () => {
    const sizes = Object.values(WM_FONT_SIZES);
    expect(sizes).toHaveLength(7);
    expect(sizes.every((size, i) => i === 0 || size > sizes[i - 1])).toBe(true);
  });

  it('uses a 4-point spacing grid', () => {
    for (const step of WM_SPACING) expect(step % 4).toBe(0);
  });

  it('keeps radii to five steps and motion to three durations', () => {
    expect(Object.keys(WM_RADII)).toHaveLength(5);
    const durations = [WM_MOTION.hover, WM_MOTION.panel, WM_MOTION.page];
    expect(new Set(durations).size).toBe(3);
  });

  it('declares unique --wm-* semantic tokens covering every status', () => {
    const keys = WM_SEMANTIC_TOKENS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.startsWith('--wm-')).toBe(true);
    for (const status of WM_STATUSES) {
      const varName = statusColorVar(status).slice(4, -1);
      expect(keys).toContain(varName);
    }
  });

  it('maps needsYou to the kebab-case variable', () => {
    expect(statusColorVar('needsYou')).toBe('var(--wm-status-needs-you)');
    expect(statusColorVar('done')).toBe('var(--wm-status-done)');
  });
});

describe('contrast helpers', () => {
  it('parses short and long hex colours', () => {
    expect(parseHexColor('#fff')).toEqual([255, 255, 255]);
    expect(parseHexColor('#B4410F')).toEqual([180, 65, 15]);
    expect(parseHexColor('red')).toBeNull();
  });

  it('computes WCAG luminance and ratios', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('throws on invalid colours', () => {
    expect(() => relativeLuminance('nope')).toThrow();
  });
});
