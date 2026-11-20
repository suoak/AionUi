/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CSBU WorkMate design system v2 — scales and semantic token names.
 *
 * This module is the single source of truth for the design scales used by the
 * 3.0 UI overhaul (see `docs/theming/design-system.md`). It only declares names
 * and numbers; the CSS custom properties are defined by the theme stylesheets.
 * Components should consume the `--wm-*` semantic tokens rather than raw
 * palette variables (`--bg-6`, `--aou-*`, Arco `--color-*`).
 */

/** Type scale in px. Seven steps replace the ad-hoc sizes used before 3.0. */
export const WM_FONT_SIZES = {
  /** Badges, captions, status-bar text. */
  caption: 11,
  /** Secondary labels, metadata. */
  secondary: 12,
  /** Default UI chrome (sidebar rows, menus, buttons). */
  ui: 13,
  /** Body and chat message text. */
  body: 14,
  /** Section titles. */
  subtitle: 16,
  /** Page titles. */
  title: 20,
  /** Home greeting. */
  hero: 28,
} as const;

export type WmFontSizeKey = keyof typeof WM_FONT_SIZES;

/** Line heights (unitless). Chat messages read better slightly looser. */
export const WM_LINE_HEIGHTS = {
  ui: 1.5,
  message: 1.65,
} as const;

/** 4-point spacing grid in px. */
export const WM_SPACING = [4, 8, 12, 16, 20, 24, 32, 48] as const;

export type WmSpacing = (typeof WM_SPACING)[number];

/** Corner radii in px. */
export const WM_RADII = {
  /** Inside controls (chips inside inputs, inline code). */
  inner: 4,
  /** Buttons and inputs. */
  control: 6,
  /** Cards, popovers, menus. */
  card: 10,
  /** Large panels and dialogs. */
  panel: 14,
  /** Pills and avatars. */
  pill: 9999,
} as const;

export type WmRadiusKey = keyof typeof WM_RADII;

/** Motion durations (ms) and the single easing curve. */
export const WM_MOTION = {
  hover: 120,
  panel: 180,
  page: 240,
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;

/**
 * The five shared run states. Every surface that shows activity (sidebar rows,
 * task cards, tabs, command palette, notifications, dock badge) uses exactly
 * these states and the same glyph per state.
 */
export const WM_STATUSES = ['working', 'needsYou', 'done', 'failed', 'idle'] as const;

export type WmStatus = (typeof WM_STATUSES)[number];

/** Minimum WCAG contrast ratios enforced for the default themes. */
export const WM_CONTRAST_MIN = {
  /** Body and label text against its surface (WCAG AA). */
  text: 4.5,
  /** Control boundaries and meaningful non-text marks (WCAG 1.4.11). */
  nonText: 3,
} as const;

export type WmSemanticTokenGroup = 'surface' | 'text' | 'border' | 'accent' | 'status';

export type WmSemanticToken = {
  /** CSS custom property, including the leading `--`. */
  key: `--wm-${string}`;
  group: WmSemanticTokenGroup;
  description: string;
};

/** Semantic tokens of the design system, in documentation order. */
export const WM_SEMANTIC_TOKENS: readonly WmSemanticToken[] = [
  { key: '--wm-surface-canvas', group: 'surface', description: 'Main content background' },
  { key: '--wm-surface-sidebar', group: 'surface', description: 'Left sidebar background' },
  { key: '--wm-surface-panel', group: 'surface', description: 'Right panel and status bar background' },
  { key: '--wm-surface-raised', group: 'surface', description: 'Cards, inputs, popovers' },
  { key: '--wm-text-primary', group: 'text', description: 'Primary text' },
  { key: '--wm-text-secondary', group: 'text', description: 'Secondary text' },
  { key: '--wm-text-tertiary', group: 'text', description: 'Tertiary text, still AA on every surface' },
  { key: '--wm-text-disabled', group: 'text', description: 'Disabled text (exempt from contrast minimums)' },
  { key: '--wm-text-on-accent', group: 'text', description: 'Text on an accent fill' },
  { key: '--wm-border-subtle', group: 'border', description: 'Dividers between regions' },
  { key: '--wm-border-default', group: 'border', description: 'Cards and inputs' },
  { key: '--wm-border-strong', group: 'border', description: 'Control boundaries (>= 3:1)' },
  { key: '--wm-accent', group: 'accent', description: 'The single accent colour' },
  { key: '--wm-accent-hover', group: 'accent', description: 'Accent hover / pressed' },
  { key: '--wm-accent-subtle', group: 'accent', description: 'Accent-tinted background' },
  { key: '--wm-status-working', group: 'status', description: 'Run state: working' },
  { key: '--wm-status-needs-you', group: 'status', description: 'Run state: needs you' },
  { key: '--wm-status-done', group: 'status', description: 'Run state: done' },
  { key: '--wm-status-failed', group: 'status', description: 'Run state: failed' },
  { key: '--wm-status-idle', group: 'status', description: 'Run state: idle' },
] as const;

/** CSS variable for a run state's colour. */
export function statusColorVar(status: WmStatus): string {
  const suffix = status === 'needsYou' ? 'needs-you' : status;
  return `var(--wm-status-${suffix})`;
}
