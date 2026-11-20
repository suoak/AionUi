/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHORTCUT_SECTIONS, SHORTCUTS } from '@/renderer/pages/settings/ShortcutsSettings/shortcuts';
import { formatKeys } from '@/renderer/components/design/KeyHint';

const rendererDir = path.resolve(__dirname, '../../../packages/desktop/src/renderer');
const localesDir = path.join(rendererDir, 'services/i18n/locales');
const locales = fs
  .readdirSync(localesDir)
  .filter((name) => fs.existsSync(path.join(localesDir, name, 'settings.json')));

/** The key each handler matches, as it appears in its source file. */
const HANDLER_KEY: Record<string, RegExp> = {
  commandPalette: /key: 'k'/,
  toggleSidebar: /key: 'b'/,
  toggleWorkspace: /key: 'l'/,
  newConversation: /=== 't'/,
  nextConversation: /event\.key === 'Tab'/,
  previousConversation: /event\.shiftKey \? -1 : 1/,
  send: /e\.key === 'Enter' && !e\.shiftKey/,
  newLine: /e\.key === 'Enter' && !e\.shiftKey/,
  saveToDraft: /event\.key !== 'Enter'/,
  history: /event\.key === 'ArrowUp'/,
  leaveHistory: /event\.key === 'Escape'/,
  saveFile: /e\.key === 's'/,
  closeTab: /!== 'w'/,
};

describe('Keyboard shortcuts page data (3.0 V7)', () => {
  it('every listed shortcut is still implemented by its source file', () => {
    for (const entry of SHORTCUTS) {
      const source = fs.readFileSync(path.join(rendererDir, entry.source), 'utf8');
      expect(HANDLER_KEY[entry.id], entry.id).toBeDefined();
      expect(source, `${entry.id} in ${entry.source}`).toMatch(HANDLER_KEY[entry.id]);
    }
  });

  it('ids are unique, sections are known and every label exists in all locales', () => {
    expect(new Set(SHORTCUTS.map((e) => e.id)).size).toBe(SHORTCUTS.length);
    expect(locales).toHaveLength(13);
    for (const locale of locales) {
      const page = JSON.parse(fs.readFileSync(path.join(localesDir, locale, 'settings.json'), 'utf8')).shortcutsPage;
      for (const section of SHORTCUT_SECTIONS) expect(page.sections[section], `${locale} ${section}`).toBeTruthy();
      for (const entry of SHORTCUTS) {
        expect(SHORTCUT_SECTIONS).toContain(entry.section);
        expect(page.actions[entry.id], `${locale} ${entry.id}`).toBeTruthy();
      }
    }
  });

  it('formats the new key names per platform', () => {
    expect(formatKeys(['Ctrl', 'Shift', 'Tab'], true)).toBe('⌃⇧⇥');
    expect(formatKeys(['Ctrl', 'Shift', 'Tab'], false)).toBe('Ctrl+Shift+Tab');
    expect(formatKeys(['Mod', 'K'], false)).toBe('Ctrl+K');
    expect(formatKeys(['ArrowUp'], true)).toBe('↑');
  });
});
