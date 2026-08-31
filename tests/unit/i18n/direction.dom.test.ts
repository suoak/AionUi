import { describe, expect, it } from 'vitest';

import { applyDocumentDirection, directionForLanguage, isRtlLanguage } from '@/renderer/services/i18n/direction';

describe('application language direction', () => {
  it('normalizes Persian variants as RTL', () => {
    expect(isRtlLanguage('fa')).toBe(true);
    expect(isRtlLanguage('fa_IR')).toBe(true);
    expect(directionForLanguage('fa-IR')).toBe('rtl');
  });

  it('falls back to LTR for missing or non-RTL languages', () => {
    expect(directionForLanguage(undefined)).toBe('ltr');
    expect(directionForLanguage('de-DE')).toBe('ltr');
  });

  it('updates html language and direction across language changes', () => {
    applyDocumentDirection('fa-IR');
    expect(document.documentElement.dir).toBe('rtl');
    applyDocumentDirection('zh-CN');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('zh-CN');
  });
});
