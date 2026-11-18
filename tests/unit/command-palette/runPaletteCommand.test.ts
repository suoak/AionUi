/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { PaletteCommand } from '@/renderer/components/command-palette/commandRegistry';
import { runPaletteCommand } from '@/renderer/components/command-palette/runPaletteCommand';

const deps = () => ({
  navigate: vi.fn(),
  launchPreview: vi.fn().mockResolvedValue(undefined),
  invokeCommand: vi.fn(),
  openPanel: vi.fn(),
});

describe('runPaletteCommand', () => {
  it('opens a file in the in-app preview and does not navigate', async () => {
    const d = deps();
    const cmd: PaletteCommand = {
      id: 'file.docs/notes.md',
      title: 'notes.md',
      group: 'files',
      action: 'open-file',
      file: { name: 'notes.md', relativePath: 'docs/notes.md', fullPath: '/ws/docs/notes.md' },
    };
    await expect(runPaletteCommand(cmd, d)).resolves.toBe('previewed');
    expect(d.launchPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        relativePath: 'docs/notes.md',
        originalPath: '/ws/docs/notes.md',
        file_name: 'notes.md',
        contentType: 'markdown',
        editable: true,
        language: 'markdown',
      })
    );
    expect(d.navigate).not.toHaveBeenCalled();
    expect(d.invokeCommand).not.toHaveBeenCalled();
  });

  it('invokes a plugin command and opens the hinted panel', async () => {
    const d = deps();
    d.invokeCommand.mockResolvedValue({
      status: 'accepted',
      command: { id: 'ext-notes-open', extensionName: 'notes', title: 'Open notes' },
      openPanel: { id: 'ext-notes-panel', extensionName: 'notes', title: 'Notes', entryPoint: '/x' },
    });
    const cmd: PaletteCommand = {
      id: 'command.notes.ext-notes-open',
      title: 'Open notes',
      group: 'commands',
      action: 'invoke-command',
      pluginCommand: { id: 'ext-notes-open', extensionName: 'notes' },
    };
    await expect(runPaletteCommand(cmd, d)).resolves.toBe('invoked');
    expect(d.invokeCommand).toHaveBeenCalledWith({ id: 'ext-notes-open', extensionName: 'notes' });
    expect(d.openPanel).toHaveBeenCalledWith('ext-notes-panel');
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it('invokes without opening a panel when the Host returns no hint', async () => {
    const d = deps();
    d.invokeCommand.mockResolvedValue({ status: 'accepted', command: { id: 'c', extensionName: 'x', title: 'C' } });
    const cmd: PaletteCommand = {
      id: 'command.x.c',
      title: 'C',
      group: 'commands',
      action: 'invoke-command',
      pluginCommand: { id: 'c', extensionName: 'x' },
    };
    await expect(runPaletteCommand(cmd, d)).resolves.toBe('invoked');
    expect(d.openPanel).not.toHaveBeenCalled();
  });

  it('navigates path-only commands', async () => {
    const d = deps();
    const cmd: PaletteCommand = { id: 'nav.settings', title: 'Settings', group: 'settings', path: '/settings' };
    await expect(runPaletteCommand(cmd, d)).resolves.toBe('navigated');
    expect(d.navigate).toHaveBeenCalledWith('/settings');
  });
});
