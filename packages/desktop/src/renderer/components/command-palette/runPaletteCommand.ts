/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IExtensionCommandInvokeResult } from '@/common/adapter/ipcBridge';
import type { PreviewLaunchOptions } from '@/renderer/hooks/file/usePreviewLauncher';
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';
import type { PaletteCommand } from './commandRegistry';

export type PaletteActionDeps = {
  navigate: (path: string) => void;
  launchPreview: (options: PreviewLaunchOptions) => Promise<void>;
  invokeCommand: (req: { id: string; extensionName?: string }) => Promise<IExtensionCommandInvokeResult | undefined>;
  openPanel: (id: string) => void;
};

export type PaletteActionResult = 'navigated' | 'previewed' | 'invoked' | 'noop';

/**
 * Run a palette row in-app only (D11-k3): router navigation, in-app preview,
 * or Host command invoke (which may open a plugin panel). Never shells out.
 */
export async function runPaletteCommand(cmd: PaletteCommand, deps: PaletteActionDeps): Promise<PaletteActionResult> {
  if (cmd.action === 'open-file' && cmd.file) {
    const info = getFileTypeInfo(cmd.file.name);
    await deps.launchPreview({
      relativePath: cmd.file.relativePath,
      originalPath: cmd.file.fullPath || undefined,
      file_name: cmd.file.name,
      contentType: info.contentType,
      editable: info.editable,
      language: info.language,
    });
    return 'previewed';
  }
  if (cmd.action === 'invoke-command' && cmd.pluginCommand) {
    const result = await deps.invokeCommand({
      id: cmd.pluginCommand.id,
      extensionName: cmd.pluginCommand.extensionName,
    });
    const panelId = result?.openPanel?.id;
    if (typeof panelId === 'string' && panelId.trim()) {
      deps.openPanel(panelId.trim());
    }
    return 'invoked';
  }
  if (cmd.path) {
    deps.navigate(cmd.path);
    return 'navigated';
  }
  return 'noop';
}
