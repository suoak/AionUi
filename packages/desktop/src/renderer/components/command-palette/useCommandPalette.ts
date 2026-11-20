/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { isPrimaryApplicationShortcut } from '@/renderer/utils/ui/keyboardShortcuts';

/** Window event that asks the mounted palette to open (titlebar ⌘K button, status bar, …). */
export const OPEN_COMMAND_PALETTE_EVENT = 'csbu-workmate-open-command-palette';

/** Opens the command palette from anywhere in the renderer. */
export function requestCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

/**
 * Global Cmd/Ctrl+K palette open state.
 * Uses `embedded-editor` guard so the shortcut works from chat inputs but not
 * inside Monaco / CodeMirror / xterm (D11-k2).
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);
  const togglePalette = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      let matched = false;
      try {
        matched = isPrimaryApplicationShortcut(event, {
          key: 'k',
          targetGuard: 'embedded-editor',
        });
      } catch {
        // Incomplete platform mocks in unrelated Layout tests must not crash.
        return;
      }
      if (!matched) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setOpen((v) => !v);
    };
    const onOpenRequest = () => setOpen(true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
    };
  }, []);

  return { open, setOpen, openPalette, closePalette, togglePalette };
}
