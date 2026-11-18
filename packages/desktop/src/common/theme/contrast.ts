/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WCAG 2.x contrast helpers for `#rgb` / `#rrggbb` colours. Used by the design
 * system tests to keep the default themes readable.
 */

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Parse `#rgb` or `#rrggbb` into 0–255 channels; returns null for anything else. */
export function parseHexColor(hex: string): [number, number, number] | null {
  const match = HEX_RE.exec(hex.trim());
  if (!match) return null;
  let digits = match[1];
  if (digits.length === 3) {
    digits = digits
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance of a hex colour. Throws on an invalid colour. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHexColor(hex);
  if (!rgb) throw new Error(`invalid hex colour: ${hex}`);
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
