/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  bindImportedTranscript,
  getImportedTranscript,
  listExternalSessions,
  previewExternalSession,
} from '@process/services/sessionImportManager';

export function initSessionImportBridge(): void {
  ipcBridge.sessionImport.list.provider(async () => listExternalSessions());
  ipcBridge.sessionImport.preview.provider(async (params) => previewExternalSession(params));
  ipcBridge.sessionImport.bind.provider(async (params) => bindImportedTranscript(params));
  ipcBridge.sessionImport.getImportedTranscript.provider(async (params) =>
    getImportedTranscript(params.conversation_id)
  );
}
