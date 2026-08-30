/**
 * Locale-aware number and date formatting bound to the language selected in
 * the app. Callers must pass `i18n.language`; falling back to the host locale
 * would make rendered values disagree with translated labels.
 */

import { DEFAULT_LANGUAGE, normalizeLanguageCode, type SupportedLanguage } from '@/common/config/i18n';

const DATE_TIME_DEFAULTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
};

const numberFormatCache = new Map<string, Intl.NumberFormat>();
const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();

export function resolveFormatLocale(language?: string | null): SupportedLanguage {
  if (!language?.trim()) return DEFAULT_LANGUAGE;
  return normalizeLanguageCode(language);
}

function getNumberFormat(locale: SupportedLanguage, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options ?? {})}`;
  let formatter = numberFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatCache.set(key, formatter);
  }
  return formatter;
}

function getDateTimeFormat(locale: SupportedLanguage, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options ?? {})}`;
  let formatter = dateTimeFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateTimeFormatCache.set(key, formatter);
  }
  return formatter;
}

export function formatNumber(value: number, language?: string | null, options?: Intl.NumberFormatOptions): string {
  return getNumberFormat(resolveFormatLocale(language), options).format(value);
}

export function formatCurrency(
  amount: number,
  currency: string,
  language?: string | null,
  options?: Intl.NumberFormatOptions
): string {
  const locale = resolveFormatLocale(language);
  try {
    return getNumberFormat(locale, { style: 'currency', currency, ...options }).format(amount);
  } catch {
    const digits = options?.maximumFractionDigits ?? 4;
    const fallbackOptions: Intl.NumberFormatOptions =
      options?.maximumSignificantDigits != null
        ? { maximumSignificantDigits: options.maximumSignificantDigits }
        : { minimumFractionDigits: digits, maximumFractionDigits: digits };
    return `${getNumberFormat(locale, fallbackOptions).format(amount)} ${currency}`;
  }
}

export function formatDateTime(
  value: number | Date,
  language?: string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  return getDateTimeFormat(resolveFormatLocale(language), options ?? DATE_TIME_DEFAULTS).format(value);
}

export function formatDate(
  value: number | Date,
  language?: string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatDateTime(value, language, options ?? { year: 'numeric', month: 'numeric', day: 'numeric' });
}

export function formatTime(
  value: number | Date,
  language?: string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatDateTime(value, language, options ?? { hour: 'numeric', minute: 'numeric', second: 'numeric' });
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatByteSize(bytes: number, language?: string | null, maximumFractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${BYTE_UNITS[0]}`;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${formatNumber(value, language, { maximumFractionDigits })} ${BYTE_UNITS[exponent]}`;
}

export function formatByteRate(bytesPerSecond: number, language?: string | null): string {
  return `${formatByteSize(bytesPerSecond, language)}/s`;
}
