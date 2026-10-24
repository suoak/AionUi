/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type {
  SkillGovernance,
  SkillSource,
  SkillSourceDetail,
  SkillSourceImportKind,
} from '@/common/types/skills/skillSources';

/** Anything the backend does not explicitly mark trusted is shown as untrusted. */
export const isUntrustedSource = (source: SkillSource | null | undefined): boolean =>
  !!source && source.trust !== 'trusted';

/** Kinds Core can re-fetch (registry sources are not refreshable). */
const REFRESHABLE_KINDS = new Set(['url', 'git', 'local_snapshot']);

export const isRefreshableSource = (source: SkillSource | null | undefined): boolean =>
  !!source && REFRESHABLE_KINDS.has(source.kind);

/** Whether the newest version carries executable scripts. */
export const latestHasScripts = (detail: SkillSourceDetail | undefined): boolean => !!detail?.versions[0]?.has_scripts;

const KNOWN_ERRORS = new Set([
  'skill_review_not_pending',
  'skill_source_renamed',
  'skill_source_not_refreshable',
  'skill_import_no_skill_found',
  'source_fetch_failed',
  'source_fetch_timeout',
  'source_too_large',
  'source_url_invalid',
  'source_address_blocked',
  'source_git_unsupported',
]);

/** 413/502/504 bodies carry only a generic public message, so map by status. */
const STATUS_ERRORS: Record<number, string> = {
  413: 'source_too_large',
  502: 'source_fetch_failed',
  504: 'source_fetch_timeout',
};

/**
 * Core returns generic `code`s (BAD_REQUEST, CONFLICT, ...) for these routes;
 * the specific reason is the `snake_case:` prefix of the `error` message
 * (e.g. "skill_review_not_pending: approved").
 */
export const skillErrorReason = (error: unknown): string | null => {
  if (!isBackendHttpError(error)) return null;
  if (KNOWN_ERRORS.has(error.code)) return error.code;
  const prefix = /^([a-z][a-z0-9_]*)(?::|$)/.exec(error.backendMessage.trim())?.[1];
  if (prefix && KNOWN_ERRORS.has(prefix)) return prefix;
  return STATUS_ERRORS[error.status] ?? (error.status === 403 ? 'forbidden' : null);
};

/** i18n key for a failed import / review / refresh call. */
export const skillReviewErrorKey = (error: unknown): string =>
  `settings.skillsHub.review.errors.${skillErrorReason(error) ?? 'generic'}`;

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

/** Names from a just-finished import that landed in the review queue. */
export const pendingImportedNames = (importedNames: string[], pending: SkillGovernance[]): string[] => {
  const pendingNames = new Set(pending.map((p) => p.name));
  return importedNames.filter((name) => pendingNames.has(name));
};

const CREATED_BY = new Set(['user', 'import', 'evolution']);

/** i18n key for SkillVersion.created_by, or null to show the raw value. */
export const versionCreatedByKey = (createdBy: string): string | null =>
  CREATED_BY.has(createdBy) ? `settings.skillsHub.review.createdBy.${createdBy}` : null;
