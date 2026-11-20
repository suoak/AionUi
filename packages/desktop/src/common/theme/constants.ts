/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const LIGHT_THEME_ID = 'light';
export const DARK_THEME_ID = 'dark';
/** Sentinel id stored in `theme.activeId`: resolve to Light/Dark from the OS appearance. */
export const SYSTEM_THEME_ID = 'system';
/** The pre-3.0 Arco blue / AOU purple palette, kept as an opt-out from Ember / Dusk. */
export const CLASSIC_LIGHT_THEME_ID = 'classic-light';
export const CLASSIC_DARK_THEME_ID = 'classic-dark';
/** Sentinel id: resolve to Classic Light / Classic Dark from the OS appearance. */
export const CLASSIC_SYSTEM_THEME_ID = 'system-classic';

/** Sentinel ids that follow the OS appearance. */
export const SYSTEM_SENTINEL_THEME_IDS: ReadonlySet<string> = new Set([SYSTEM_THEME_ID, CLASSIC_SYSTEM_THEME_ID]);
