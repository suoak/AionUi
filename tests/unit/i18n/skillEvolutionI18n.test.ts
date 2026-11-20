/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// 3.0 V10 part 1: the Skill Evolution pages carry no hard-coded copy, and every
// key they use exists in all 13 locales.
const root = path.resolve(__dirname, '../../../packages/desktop/src/renderer');
const pages = ['SkillEvolutionListPage.tsx', 'SkillEvolutionCreatePage.tsx'].map((file) =>
  path.join(root, 'pages/skill-evolution', file)
);
const localesDir = path.join(root, 'services/i18n/locales');
const locales = fs.readdirSync(localesDir).filter((name) => fs.statSync(path.join(localesDir, name)).isDirectory());

const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const lookup = (tree: unknown, dotted: string): unknown =>
  dotted.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree);

const placeholders = (value: string) => [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe('Skill Evolution i18n (3.0 V10 part 1)', () => {
  it('has no hard-coded CJK copy', () => {
    for (const page of pages) {
      const lines = stripComments(fs.readFileSync(page, 'utf8'))
        .split('\n')
        .filter((line) => /[\u4e00-\u9fff]/.test(line));
      expect(lines, path.basename(page)).toEqual([]);
    }
  });

  it('every static key exists in all 13 locales, with the same placeholders', () => {
    expect(locales).toHaveLength(13);
    const keys = new Set<string>();
    for (const page of pages) {
      for (const match of fs.readFileSync(page, 'utf8').matchAll(/t\('agent\.skillEvolution\.([\w.]+)'/g)) {
        keys.add(match[1]);
      }
    }
    // Dynamic groups used through labelMap / the gate badge.
    for (const key of ['draft', 'pending_review', 'approved', 'rejected', 'applied', 'rolled_back'])
      keys.add(`status.${key}`);
    for (const key of ['pattern', 'skill_impact', 'rejected_note', 'index', 'general']) keys.add(`kind.${key}`);
    for (const key of ['private', 'team', 'owner_editors']) keys.add(`visibility.${key}`);
    for (const key of ['human_only', 'heuristic_assist', 'auto_apply_on_pass']) keys.add(`gateMode.${key}`);
    for (const key of ['approve', 'reject', 'review']) keys.add(`gate.${key}`);
    expect(keys.size).toBeGreaterThan(90);

    const english = JSON.parse(fs.readFileSync(path.join(localesDir, 'en-US/agent.json'), 'utf8')).skillEvolution;
    for (const locale of locales) {
      const tree = JSON.parse(fs.readFileSync(path.join(localesDir, locale, 'agent.json'), 'utf8')).skillEvolution;
      for (const key of keys) {
        const value = lookup(tree, key);
        expect(typeof value, `${locale} ${key}`).toBe('string');
        expect((value as string).trim(), `${locale} ${key}`).not.toBe('');
        expect(placeholders(value as string), `${locale} ${key}`).toEqual(placeholders(lookup(english, key) as string));
      }
    }
  });
});
