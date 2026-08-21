/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { LARGE_TEXT_VIEWER_THRESHOLD, LONG_LINE_HIGHLIGHT_THRESHOLD } from '../constants';

/**
 * Resolve a CodeMirror language description by an explicit language name first,
 * then by file extension as a fallback. Name matching is fuzzy so common
 * aliases (e.g. "typescript") resolve correctly. Returns null when nothing
 * matches so callers can fall back to plain text.
 */
export const matchLanguageDescription = (languageName?: string, fileName?: string): LanguageDescription | null => {
  if (languageName) {
    const byName = LanguageDescription.matchLanguageName(languages, languageName, true);
    if (byName) return byName;
  }
  if (fileName) {
    const byFile = LanguageDescription.matchFilename(languages, fileName);
    if (byFile) return byFile;
  }
  return null;
};

/**
 * Lazily load the {@link LanguageSupport} for the matched language. The dynamic
 * import is wrapped so it never throws: any load failure (or no match) resolves
 * to null, letting the editor degrade gracefully to plain text.
 */
export const loadLanguageSupport = async (
  languageName?: string,
  fileName?: string
): Promise<LanguageSupport | null> => {
  const desc = matchLanguageDescription(languageName, fileName);
  if (!desc) return null;
  try {
    return await desc.load();
  } catch {
    return null;
  }
};

/**
 * CodeMirror cannot construct a document that contains U+0000. UTF-16 JSON
 * mis-decoded as UTF-8 is ASCII interleaved with NULs; stripping them yields
 * the original ASCII and lets the editor open instead of crashing the tab.
 */
export const sanitizeEditorDocument = (text: string): string => {
  if (!text.includes('\0')) return text;
  return text.replaceAll('\0', '');
};

const hasOverlongLine = (text: string, limit: number): boolean => {
  let start = 0;
  while (start < text.length) {
    const nl = text.indexOf('\n', start);
    const end = nl === -1 ? text.length : nl;
    if (end - start > limit) return true;
    start = end + 1;
  }
  return false;
};

/**
 * Highlighting guard. Large documents and minified single-line JSON both make
 * CodeMirror's JSON highlighter stall; we turn highlighting off and still
 * show the full (editable) document.
 */
export const shouldDisableHighlighting = (length: number, text?: string): boolean => {
  if (length > LARGE_TEXT_VIEWER_THRESHOLD) return true;
  return typeof text === 'string' && hasOverlongLine(text, LONG_LINE_HIGHLIGHT_THRESHOLD);
};
