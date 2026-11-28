/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 3.0 V10: no hard-coded Chinese/Japanese UI copy in renderer code (comments
 * excluded). The allowlist only holds data that must stay in its own script
 * (language names, speech prompts, search aliases, matchers for agent or
 * backend text) plus a few files whose CJK is data, not UI copy.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDir = path.resolve(__dirname, '../../../packages/desktop/src/renderer');
const CJK = /[\u3040-\u30ff\u4e00-\u9fff]/;

/** Relative path → maximum CJK lines allowed, with the reason. */
const ALLOWLIST: Record<string, { max: number; reason: string }> = {
  'components/layout/primaryNav/primaryNav.ts': { max: 5, reason: 'Chinese search aliases' },
  'components/command-palette/commandRegistry.ts': { max: 2, reason: 'Chinese search aliases' },
  'components/settings/LanguageSwitcher.tsx': { max: 3, reason: 'language endonyms' },
  'pages/login/index.tsx': { max: 3, reason: 'language endonyms' },
  'components/settings/SettingsModal/contents/SystemModalContent/VoiceInputSection/speechSettingsUtils.ts': {
    max: 5,
    reason: 'language endonyms and speech-recognition prompts',
  },
  'hooks/system/useSpeechInput.ts': { max: 1, reason: 'CJK character-class regex' },
  'hooks/agent/usePresetAssistantInfo.ts': { max: 1, reason: 'matches Chinese assistant prompts' },
  'pages/conversation/components/ConversationTitleMinimap/minimapUtils.ts': {
    max: 4,
    reason: 'parses Chinese numerals in titles',
  },
  'pages/conversation/Messages/components/reviewMarker.ts': { max: 2, reason: 'matches agent review markers' },
  'pages/tasks/workItemWorktreeModel.ts': { max: 1, reason: 'matches agent evaluation comments' },
  'utils/model/agentLogo.ts': { max: 1, reason: 'matches Chinese model labels' },
  'theme/builtinThemes.ts': { max: 1, reason: 'third-party theme name' },
};

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return full.includes(path.join('services', 'i18n')) ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [full] : [];
  });

describe('no hard-coded CJK UI copy in the renderer (3.0 V10)', () => {
  const counts = new Map<string, number>();
  for (const file of walk(rendererDir)) {
    const lines = stripComments(fs.readFileSync(file, 'utf8'))
      .split('\n')
      .filter((line) => CJK.test(line)).length;
    if (lines > 0) counts.set(path.relative(rendererDir, file).split(path.sep).join('/'), lines);
  }

  it('only allowlisted files contain CJK outside comments, within their caps', () => {
    const offenders = [...counts].filter(([file, n]) => !ALLOWLIST[file] || n > ALLOWLIST[file].max);
    expect(offenders).toEqual([]);
  });

  it('the allowlist has no stale entries', () => {
    const stale = Object.keys(ALLOWLIST).filter((file) => !counts.has(file));
    expect(stale).toEqual([]);
  });

  it('the component showcase is development-only', () => {
    const router = fs.readFileSync(path.join(rendererDir, 'components/layout/Router.tsx'), 'utf8');
    expect(router).toMatch(/SHOW_DEV_SHOWCASE = process\.env\.NODE_ENV !== 'production'/);
    expect(router).toMatch(/\{SHOW_DEV_SHOWCASE \? \(?\s*<Route path='\/test\/components'/);
  });
});
