/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { isPrimaryApplicationShortcut } from '@/renderer/utils/ui/keyboardShortcuts';

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
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return { open, setOpen, openPalette, closePalette, togglePalette };
}
