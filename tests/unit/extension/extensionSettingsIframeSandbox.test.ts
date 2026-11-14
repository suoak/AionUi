/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXTENSION_PANEL_IFRAME_SANDBOX,
  EXTENSION_SETTINGS_IFRAME_SANDBOX,
} from '@/renderer/hooks/system/extensionPanelCatalog';

const root = path.resolve(__dirname, '../../..');
const SETTINGS_FRAMES = [
  'packages/desktop/src/renderer/components/settings/SettingsModal/contents/ExtensionSettingsTabContent.tsx',
  'packages/desktop/src/renderer/pages/settings/ExtensionSettingsPage.tsx',
];

describe('extension settings-tab iframe sandbox (security review F1)', () => {
  it('gives settings tabs an opaque origin like panels', () => {
    for (const value of [EXTENSION_SETTINGS_IFRAME_SANDBOX, EXTENSION_PANEL_IFRAME_SANDBOX]) {
      const tokens = value.split(/\s+/);
      expect(tokens).toContain('allow-scripts');
      for (const forbidden of ['allow-same-origin', 'allow-top-navigation', 'allow-popups', 'allow-forms']) {
        expect(tokens).not.toContain(forbidden);
      }
    }
  });

  it('both settings-tab frames use the shared sandbox constant and never allow-same-origin', () => {
    for (const rel of SETTINGS_FRAMES) {
      const source = readFileSync(path.join(root, rel), 'utf8');
      expect(source, rel).toContain('sandbox={EXTENSION_SETTINGS_IFRAME_SANDBOX}');
      expect(source, rel).not.toContain('allow-same-origin');
    }
  });
});
