/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from './types';
import {
  LIGHT_THEME_ID,
  DARK_THEME_ID,
  SYSTEM_THEME_ID,
  CLASSIC_LIGHT_THEME_ID,
  CLASSIC_DARK_THEME_ID,
  CLASSIC_SYSTEM_THEME_ID,
} from './constants';

/** Map a stored theme id to a concrete theme id, expanding the follow-system sentinels. */
export function resolveThemeId(activeId: string, prefersDark?: boolean): string {
  if (activeId === SYSTEM_THEME_ID) return prefersDark ? DARK_THEME_ID : LIGHT_THEME_ID;
  if (activeId === CLASSIC_SYSTEM_THEME_ID) return prefersDark ? CLASSIC_DARK_THEME_ID : CLASSIC_LIGHT_THEME_ID;
  return activeId;
}

/**
 * Pure: caller supplies the full theme list (builtins + user). Falls back to Light, then first.
 * `system` / `system-classic` resolve to the matching built-in Dark/Light theme via
 * `prefersDark` (callers pass the `prefers-color-scheme` media query result; this module
 * must stay DOM-free).
 */
export function resolveActiveTheme(activeId: string, themes: Theme[], prefersDark?: boolean): Theme {
  const targetId = resolveThemeId(activeId, prefersDark);
  return themes.find((t) => t.id === targetId) ?? themes.find((t) => t.id === LIGHT_THEME_ID) ?? themes[0];
}

/**
 * The classic (pre-3.0) equivalent of an Ember / Dusk selection, used by the
 * one-click "restore classic look". Returns null for ids that are not Ember / Dusk.
 */
export function classicThemeIdFor(activeId: string): string | null {
  if (activeId === LIGHT_THEME_ID) return CLASSIC_LIGHT_THEME_ID;
  if (activeId === DARK_THEME_ID) return CLASSIC_DARK_THEME_ID;
  if (activeId === SYSTEM_THEME_ID) return CLASSIC_SYSTEM_THEME_ID;
  return null;
}

/** Whether a stored theme id is one of the classic (pre-3.0) selections. */
export function isClassicThemeId(activeId: string | null | undefined): boolean {
  return (
    activeId === CLASSIC_LIGHT_THEME_ID || activeId === CLASSIC_DARK_THEME_ID || activeId === CLASSIC_SYSTEM_THEME_ID
  );
}

/**
 * Target id for the quick light/dark toggle: stays within the classic family when
 * the user opted out of Ember / Dusk, otherwise picks Ember (light) or Dusk (dark).
 */
export function appearanceToggleTargetId(activeId: string | null | undefined, appearance: 'light' | 'dark'): string {
  if (isClassicThemeId(activeId)) return appearance === 'dark' ? CLASSIC_DARK_THEME_ID : CLASSIC_LIGHT_THEME_ID;
  return appearance === 'dark' ? DARK_THEME_ID : LIGHT_THEME_ID;
}
