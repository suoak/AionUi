import { describe, it, expect } from 'vitest';
import {
  appearanceToggleTargetId,
  classicThemeIdFor,
  isClassicThemeId,
  resolveActiveTheme,
  resolveThemeId,
} from '@/common/theme/resolveTheme';
import {
  LIGHT_THEME_ID,
  DARK_THEME_ID,
  SYSTEM_THEME_ID,
  CLASSIC_LIGHT_THEME_ID,
  CLASSIC_DARK_THEME_ID,
  CLASSIC_SYSTEM_THEME_ID,
} from '@/common/theme/constants';
import type { Theme } from '@/common/theme/types';

const mk = (id: string, appearance: 'light' | 'dark' = 'light'): Theme => ({
  id,
  name: id,
  appearance,
  builtin: true,
  created_at: 0,
  updated_at: 0,
});
const light = mk(LIGHT_THEME_ID);
const dark = mk(DARK_THEME_ID, 'dark');
const userTheme: Theme = {
  id: 'u1',
  name: 'Mine',
  appearance: 'dark',
  css: 'body{}',
  builtin: false,
  created_at: 1,
  updated_at: 1,
};
const themes = [light, dark, userTheme];

describe('resolveActiveTheme', () => {
  it('returns a theme by id', () => {
    expect(resolveActiveTheme(DARK_THEME_ID, themes).id).toBe(DARK_THEME_ID);
  });
  it('returns a user theme by id', () => {
    expect(resolveActiveTheme('u1', themes).id).toBe('u1');
  });
  it('falls back to Light when id is unknown', () => {
    expect(resolveActiveTheme('nope', themes).id).toBe(LIGHT_THEME_ID);
  });
  it('falls back to Light when id is empty', () => {
    expect(resolveActiveTheme('', themes).id).toBe(LIGHT_THEME_ID);
  });
  it('falls back to Light when activeId points at a removed community theme', () => {
    // Decorative community skins (e.g. hello-kitty, retro-windows) were deprecated and
    // removed; only Light/Dark remain built in. A persisted activeId still pointing at
    // one is unknown to the resolver and safely resolves to Light — no crash, no blank UI.
    const remainingBuiltins = [light, dark];
    expect(resolveActiveTheme('hello-kitty', remainingBuiltins).id).toBe(LIGHT_THEME_ID);
    expect(resolveActiveTheme('retro-windows', remainingBuiltins).id).toBe(LIGHT_THEME_ID);
  });
  it('falls back to first theme when no Light present', () => {
    expect(resolveActiveTheme('nope', [dark, userTheme]).id).toBe(DARK_THEME_ID);
  });
  it('resolves system to Dark when prefersDark is true', () => {
    expect(resolveActiveTheme(SYSTEM_THEME_ID, themes, true).id).toBe(DARK_THEME_ID);
  });
  it('resolves system to Light when prefersDark is false', () => {
    expect(resolveActiveTheme(SYSTEM_THEME_ID, themes, false).id).toBe(LIGHT_THEME_ID);
  });
  it('resolves system to Light when prefersDark is undefined', () => {
    expect(resolveActiveTheme(SYSTEM_THEME_ID, themes).id).toBe(LIGHT_THEME_ID);
  });
  it('ignores prefersDark for non-system ids', () => {
    expect(resolveActiveTheme('u1', themes, true).id).toBe('u1');
    expect(resolveActiveTheme(LIGHT_THEME_ID, themes, true).id).toBe(LIGHT_THEME_ID);
  });
  it('falls back to Light when system resolves to a missing Dark theme', () => {
    expect(resolveActiveTheme(SYSTEM_THEME_ID, [light, userTheme], true).id).toBe(LIGHT_THEME_ID);
  });
});

describe('classic themes (3.0 opt-out)', () => {
  const classicLight = mk(CLASSIC_LIGHT_THEME_ID);
  const classicDark = mk(CLASSIC_DARK_THEME_ID, 'dark');
  const all = [light, dark, classicLight, classicDark];

  it('resolves the classic follow-system sentinel by OS appearance', () => {
    expect(resolveActiveTheme(CLASSIC_SYSTEM_THEME_ID, all, true).id).toBe(CLASSIC_DARK_THEME_ID);
    expect(resolveActiveTheme(CLASSIC_SYSTEM_THEME_ID, all, false).id).toBe(CLASSIC_LIGHT_THEME_ID);
    expect(resolveThemeId(CLASSIC_SYSTEM_THEME_ID)).toBe(CLASSIC_LIGHT_THEME_ID);
  });

  it('maps Ember / Dusk / Follow System to their classic equivalents', () => {
    expect(classicThemeIdFor(LIGHT_THEME_ID)).toBe(CLASSIC_LIGHT_THEME_ID);
    expect(classicThemeIdFor(DARK_THEME_ID)).toBe(CLASSIC_DARK_THEME_ID);
    expect(classicThemeIdFor(SYSTEM_THEME_ID)).toBe(CLASSIC_SYSTEM_THEME_ID);
    expect(classicThemeIdFor('hello-kitty')).toBeNull();
    expect(classicThemeIdFor(CLASSIC_DARK_THEME_ID)).toBeNull();
  });

  it('keeps the quick light/dark toggle inside the chosen family', () => {
    expect(appearanceToggleTargetId(LIGHT_THEME_ID, 'dark')).toBe(DARK_THEME_ID);
    expect(appearanceToggleTargetId(null, 'light')).toBe(LIGHT_THEME_ID);
    expect(appearanceToggleTargetId('u1', 'dark')).toBe(DARK_THEME_ID);
    expect(appearanceToggleTargetId(CLASSIC_LIGHT_THEME_ID, 'dark')).toBe(CLASSIC_DARK_THEME_ID);
    expect(appearanceToggleTargetId(CLASSIC_SYSTEM_THEME_ID, 'light')).toBe(CLASSIC_LIGHT_THEME_ID);
    expect(isClassicThemeId(CLASSIC_SYSTEM_THEME_ID)).toBe(true);
    expect(isClassicThemeId(SYSTEM_THEME_ID)).toBe(false);
  });
});
