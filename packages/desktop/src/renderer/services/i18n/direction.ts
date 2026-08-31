import { normalizeLanguageCode } from '@/common/config/i18n';

const RTL_LANGUAGES: ReadonlySet<string> = new Set(['fa-IR']);

export type LayoutDirection = 'ltr' | 'rtl';

export function isRtlLanguage(language: string | undefined | null): boolean {
  return Boolean(language && RTL_LANGUAGES.has(normalizeLanguageCode(language)));
}

export function directionForLanguage(language: string | undefined | null): LayoutDirection {
  return isRtlLanguage(language) ? 'rtl' : 'ltr';
}

export function applyDocumentDirection(language: string | undefined | null): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dir = directionForLanguage(language);
  if (language) document.documentElement.lang = normalizeLanguageCode(language);
}
