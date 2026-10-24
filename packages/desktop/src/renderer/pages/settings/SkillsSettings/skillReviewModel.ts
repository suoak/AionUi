/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { SkillSource, SkillSourceDetail, SkillSourceImportKind } from '@/common/types/skills/skillSources';

/** Anything the backend does not explicitly mark trusted is shown as untrusted. */
export const isUntrustedSource = (source: SkillSource | null | undefined): boolean =>
  !!source && source.trust !== 'trusted';

/** Whether the newest version carries executable scripts. */
export const latestHasScripts = (detail: SkillSourceDetail | undefined): boolean => !!detail?.versions[0]?.has_scripts;

const KNOWN_ERRORS = new Set([
  'skill_review_not_pending',
  'skill_source_renamed',
  'source_fetch_failed',
  'source_fetch_timeout',
  'source_too_large',
  'source_url_invalid',
  'source_address_blocked',
]);

/** i18n key for a failed review / refresh call. */
export const skillReviewErrorKey = (error: unknown): string => {
  if (isBackendHttpError(error)) {
    if (error.code && KNOWN_ERRORS.has(error.code)) return `settings.skillsHub.review.errors.${error.code}`;
    if (error.status === 403) return 'settings.skillsHub.review.errors.forbidden';
  }
  return 'settings.skillsHub.review.errors.generic';
};

/**
 * Client-side pre-check mirroring the backend rules (https only for remote
 * sources, absolute path for local). Returns an i18n key, or null when OK.
 * The backend still enforces these, plus the internal-address block.
 */
export const validateImportLocator = (kind: SkillSourceImportKind, locator: string): string | null => {
  const value = locator.trim();
  if (!value) return 'settings.skillsHub.review.import.locatorRequired';
  if (kind === 'local') {
    return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)
      ? null
      : 'settings.skillsHub.review.import.localAbsolute';
  }
  try {
    return new URL(value).protocol === 'https:' ? null : 'settings.skillsHub.review.errors.source_url_invalid';
  } catch {
    return 'settings.skillsHub.review.errors.source_url_invalid';
  }
};
