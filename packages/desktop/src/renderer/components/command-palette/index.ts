/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { default as CommandPalette } from './CommandPalette';
export { useCommandPalette } from './useCommandPalette';
export {
  STATIC_PALETTE_COMMANDS,
  filterPaletteCommands,
  groupPaletteCommands,
  normalizePaletteQuery,
  type PaletteCommand,
  type CommandGroup,
} from './commandRegistry';
