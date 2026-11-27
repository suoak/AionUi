/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import i18nConfig from '@/common/config/i18n-config.json';

const LOCALES_DIR = path.resolve(__dirname, '../../../packages/desktop/src/renderer/services/i18n/locales');
const REFERENCE = i18nConfig.referenceLanguage;
const PLACEHOLDER = /\{\{\s*([\w.]+)[^}]*\}\}/g;

type Flat = Record<string, string>;

function flatten(value: Record<string, unknown>, prefix = '', out: Flat = {}): Flat {
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object') {
      flatten(child as Record<string, unknown>, fullKey, out);
    } else {
      out[fullKey] = String(child);
    }
  }
  return out;
}

function load(locale: string, moduleName: string): Flat {
  const file = path.join(LOCALES_DIR, locale, `${moduleName}.json`);
  return flatten(JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>);
}

function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))].toSorted();
}

// Keys added with the extension platform; translated for every locale in 3.0 V10.
const EXTENSION_KEY_PREFIXES: Record<string, string[]> = {
  common: ['extensionPanels.', 'extensionReasonCodes.'],
  settings: ['extensionSettings.'],
};

// Plural forms a locale may need beyond the en-US one/other pair (e.g. ru-RU, uk-UA few/many).
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function isPluralVariantOf(key: string, reference: Flat): boolean {
  if (!PLURAL_SUFFIX.test(key)) return false;
  const base = key.replace(PLURAL_SUFFIX, '');
  return base in reference || `${base}_one` in reference || `${base}_other` in reference;
}

const otherLocales = i18nConfig.supportedLanguages.filter((locale) => locale !== REFERENCE);

describe('locale completeness', () => {
  it.each(otherLocales)('%s has every en-US key in every module', (locale) => {
    const missing: string[] = [];
    for (const moduleName of i18nConfig.modules) {
      const reference = load(REFERENCE, moduleName);
      const translated = load(locale, moduleName);
      for (const key of Object.keys(reference)) {
        if (!(key in translated)) missing.push(`${moduleName}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it.each(otherLocales)('%s has no keys that en-US does not have (plural forms aside)', (locale) => {
    const orphans: string[] = [];
    for (const moduleName of i18nConfig.modules) {
      const reference = load(REFERENCE, moduleName);
      const translated = load(locale, moduleName);
      for (const key of Object.keys(translated)) {
        if (!(key in reference) && !isPluralVariantOf(key, reference)) orphans.push(`${moduleName}:${key}`);
      }
    }
    expect(orphans).toEqual([]);
  });

  it.each(otherLocales)('%s keeps en-US placeholders in extension strings', (locale) => {
    const mismatched: string[] = [];
    for (const [moduleName, prefixes] of Object.entries(EXTENSION_KEY_PREFIXES)) {
      const reference = load(REFERENCE, moduleName);
      const translated = load(locale, moduleName);
      for (const [key, text] of Object.entries(reference)) {
        if (!prefixes.some((prefix) => key.startsWith(prefix))) continue;
        const value = translated[key] ?? '';
        expect(value.trim().length, `${locale} ${moduleName}:${key} is empty`).toBeGreaterThan(0);
        if (placeholders(value).join() !== placeholders(text).join()) mismatched.push(`${moduleName}:${key}`);
      }
    }
    expect(mismatched).toEqual([]);
  });
});
