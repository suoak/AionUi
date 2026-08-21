import { describe, expect, it } from 'vitest';
import {
  matchLanguageDescription,
  sanitizeEditorDocument,
  shouldDisableHighlighting,
} from '@/renderer/pages/conversation/Preview/theme/languageLoader';

describe('matchLanguageDescription', () => {
  it('matches by explicit language name', () => {
    expect(matchLanguageDescription('typescript')?.name).toBe('TypeScript');
  });

  it('matches by file name extension when language name is absent', () => {
    expect(matchLanguageDescription(undefined, 'main.py')?.name).toBe('Python');
  });

  it('returns null for unknown language and file', () => {
    expect(matchLanguageDescription('not-a-language', 'file.unknownext')).toBeNull();
  });
});

describe('shouldDisableHighlighting', () => {
  it('disables for content over the viewer threshold (30k)', () => {
    expect(shouldDisableHighlighting(30_001)).toBe(true);
  });

  it('keeps highlighting for small content', () => {
    expect(shouldDisableHighlighting(100)).toBe(false);
  });

  it('disables highlighting for a compact JSON line over the line ceiling', () => {
    const compact = `{"items":${'x'.repeat(8_001)}}`;
    expect(shouldDisableHighlighting(compact.length, compact)).toBe(true);
  });

  it('keeps highlighting for pretty-printed JSON under both ceilings', () => {
    const pretty = '{\n  "ok": true\n}\n';
    expect(shouldDisableHighlighting(pretty.length, pretty)).toBe(false);
  });
});

describe('sanitizeEditorDocument', () => {
  it('returns UTF-8 text unchanged', () => {
    expect(sanitizeEditorDocument('{"ok":true}')).toBe('{"ok":true}');
  });

  it('strips NULs so UTF-16-as-UTF-8 ASCII JSON becomes readable', () => {
    const utf16AsUtf8 = '{\0"\0o\0k\0"\0:\0t\0r\0u\0e\0}';
    expect(sanitizeEditorDocument(utf16AsUtf8)).toBe('{"ok":true}');
  });
});
