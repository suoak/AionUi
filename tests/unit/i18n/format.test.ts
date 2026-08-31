import { describe, expect, it } from 'vitest';

import {
  formatByteRate,
  formatByteSize,
  formatCurrency,
  formatDateTime,
  formatNumber,
  resolveFormatLocale,
} from '@/renderer/services/i18n/format';

const INSTANT = Date.UTC(2025, 7, 17, 11, 6, 40);

describe('locale-aware display formatting', () => {
  it('normalizes unsupported regional variants to an app locale', () => {
    expect(resolveFormatLocale('zh-HK')).toBe('zh-TW');
    expect(resolveFormatLocale('de_AT')).toBe('de-DE');
  });

  it('falls back for empty or unknown language hints', () => {
    expect(resolveFormatLocale('')).toBe('en-US');
    expect(resolveFormatLocale('kl-GL')).toBe('en-US');
  });

  it('uses the app language for numbers and dates', () => {
    expect(formatNumber(12.6, 'de-DE', { minimumFractionDigits: 1 })).toBe('12,6');
    expect(
      formatDateTime(INSTANT, 'de-DE', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' })
    ).toBe('17.8.2025');
  });

  it('preserves a readable value when a currency code is invalid', () => {
    expect(formatCurrency(0.42, 'US', 'de-DE', { maximumFractionDigits: 4 })).toBe('0,4200 US');
  });

  it('formats byte values and rates without host-locale leakage', () => {
    expect(formatByteSize(12_800, 'de-DE')).toBe('12,5 KB');
    expect(formatByteRate(12_800, 'de-DE')).toBe('12,5 KB/s');
  });
});
