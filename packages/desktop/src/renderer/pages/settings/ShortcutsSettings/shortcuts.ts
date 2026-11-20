/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 3.0 V7: read-only list of the keyboard shortcuts the app handles today.
 * Each entry names the source that implements it, so the list stays honest
 * when a handler changes (see tests/unit/settings/shortcutsSettings.test.ts).
 */

import type { KeyName } from '@/renderer/components/design/KeyHint';

export type ShortcutSectionId = 'general' | 'conversations' | 'composer' | 'preview';

export type ShortcutEntry = {
  id: string;
  section: ShortcutSectionId;
  /** One or more alternative chords. */
  chords: KeyName[][];
  /** Only handled in the desktop app. */
  desktopOnly?: boolean;
  /** Renderer source file that implements the handler (relative to src/renderer). */
  source: string;
};

export const SHORTCUT_SECTIONS: readonly ShortcutSectionId[] = ['general', 'conversations', 'composer', 'preview'];

export const SHORTCUTS: readonly ShortcutEntry[] = [
  {
    id: 'commandPalette',
    section: 'general',
    chords: [['Mod', 'K']],
    source: 'components/command-palette/useCommandPalette.ts',
  },
  {
    id: 'toggleSidebar',
    section: 'general',
    chords: [['Mod', 'B']],
    desktopOnly: true,
    source: 'hooks/ui/useConversationShortcuts.ts',
  },
  {
    id: 'toggleWorkspace',
    section: 'general',
    chords: [['Mod', 'L']],
    desktopOnly: true,
    source: 'hooks/ui/useConversationShortcuts.ts',
  },
  {
    id: 'newConversation',
    section: 'conversations',
    chords: [['Mod', 'T']],
    desktopOnly: true,
    source: 'hooks/ui/useConversationShortcuts.ts',
  },
  {
    id: 'nextConversation',
    section: 'conversations',
    chords: [['Ctrl', 'Tab']],
    desktopOnly: true,
    source: 'hooks/ui/useConversationShortcuts.ts',
  },
  {
    id: 'previousConversation',
    section: 'conversations',
    chords: [['Ctrl', 'Shift', 'Tab']],
    desktopOnly: true,
    source: 'hooks/ui/useConversationShortcuts.ts',
  },
  { id: 'send', section: 'composer', chords: [['Enter']], source: 'hooks/chat/useCompositionInput.ts' },
  { id: 'newLine', section: 'composer', chords: [['Shift', 'Enter']], source: 'hooks/chat/useCompositionInput.ts' },
  {
    id: 'saveToDraft',
    section: 'composer',
    chords: [['Mod', 'Enter']],
    source: 'components/chat/SendBox/index.tsx',
  },
  {
    id: 'history',
    section: 'composer',
    chords: [['ArrowUp'], ['ArrowDown']],
    source: 'components/chat/SendBox/index.tsx',
  },
  { id: 'leaveHistory', section: 'composer', chords: [['Esc']], source: 'components/chat/SendBox/index.tsx' },
  {
    id: 'saveFile',
    section: 'preview',
    chords: [['Mod', 'S']],
    source: 'pages/conversation/Preview/hooks/usePreviewKeyboardShortcuts.ts',
  },
  {
    id: 'closeTab',
    section: 'preview',
    chords: [['Mod', 'W']],
    source: 'pages/conversation/Preview/hooks/usePreviewKeyboardShortcuts.ts',
  },
];
