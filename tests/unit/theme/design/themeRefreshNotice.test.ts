/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/common/config/configService', () => ({ configService: { get: vi.fn(), set: vi.fn() } }));
vi.mock('@renderer/hooks/context/ThemeContext', () => ({ useThemeContext: () => ({ selectTheme: vi.fn() }) }));

import { shouldShowThemeRefreshNotice } from '@renderer/theme/useThemeRefreshNotice';

describe('shouldShowThemeRefreshNotice', () => {
  it('shows once for selections that moved to Ember / Dusk', () => {
    for (const id of ['light', 'dark', 'system']) {
      expect(shouldShowThemeRefreshNotice(id, false), id).toBe(true);
      expect(shouldShowThemeRefreshNotice(id, true), id).toBe(false);
    }
  });

  it('never shows for classic, decorative or custom themes', () => {
    for (const id of ['classic-light', 'classic-dark', 'system-classic', 'hello-kitty', 'user-123']) {
      expect(shouldShowThemeRefreshNotice(id, false), id).toBe(false);
    }
  });
});
