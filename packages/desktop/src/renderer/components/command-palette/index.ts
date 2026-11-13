/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { default as CommandPalette } from './CommandPalette';
export { useCommandPalette } from './useCommandPalette';
export { usePaletteDynamicCommands, resetPaletteDynamicCache } from './usePaletteDynamicCommands';
export { DYNAMIC_LOADERS, loadAgentCommands, loadSessionCommands, loadWorkItemCommands } from './dynamicCommands';
export {
  PALETTE_GROUP_ORDER,
  STATIC_PALETTE_COMMANDS,
  buildPaletteSections,
  rankPaletteCommands,
  filterPaletteCommands,
  groupPaletteCommands,
  normalizePaletteQuery,
  type PaletteCommand,
  type PaletteSection,
  type CommandGroup,
} from './commandRegistry';
