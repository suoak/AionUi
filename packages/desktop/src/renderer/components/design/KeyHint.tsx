/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isMacOS } from '@renderer/utils/platform';
import React from 'react';

/** `Mod` is ⌘ on macOS and Ctrl elsewhere. */
export type KeyName = 'Mod' | 'Shift' | 'Alt' | 'Enter' | 'Esc' | string;

const MAC_SYMBOLS: Record<string, string> = { Mod: '⌘', Shift: '⇧', Alt: '⌥', Enter: '↵', Esc: 'esc' };
const OTHER_NAMES: Record<string, string> = { Mod: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Enter: 'Enter', Esc: 'Esc' };

/** Render a shortcut as display text: `⌘K` on macOS, `Ctrl+K` elsewhere. */
export function formatKeys(keys: KeyName[], mac: boolean = isMacOS()): string {
  if (mac) return keys.map((key) => MAC_SYMBOLS[key] ?? key.toUpperCase()).join('');
  return keys.map((key) => OTHER_NAMES[key] ?? key.toUpperCase()).join('+');
}

export type KeyHintProps = {
  keys: KeyName[];
  className?: string;
};

/** Platform-aware keyboard shortcut hint. Always rendered left-to-right, also in RTL locales. */
const KeyHint: React.FC<KeyHintProps> = ({ keys, className }) => (
  <kbd
    dir='ltr'
    className={[
      'inline-flex items-center h-18px px-5px rd-[var(--wm-radius-inner)] border border-solid border-wm-border-default',
      'bg-wm-raised text-11px leading-none font-sans text-t-tertiary tabular-nums',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
  >
    {formatKeys(keys)}
  </kbd>
);

export default KeyHint;
