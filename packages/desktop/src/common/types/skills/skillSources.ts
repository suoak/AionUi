/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// M8 E10: skill sources, versions and the script review gate.
// Mirrors aioncore `skill_governance.rs` (PR #187); fields are snake_case.

export type SkillReviewStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type SkillTrust = 'trusted' | 'untrusted';

export type SkillGovernance = {
  skill_id: string;
  name: string;
  visibility: 'private' | 'team' | string;
  team_id: string | null;
  review_status: SkillReviewStatus | string;
};

export type SkillSource = {
  kind: 'url' | 'git' | 'local_snapshot' | 'registry' | string;
  locator: string;
  ref: string | null;
  subpath: string | null;
  origin_app: 'claude' | 'codex' | string | null;
  trust: SkillTrust | string;
  last_fetched_at: number | null;
  last_commit: string | null;
};

export type SkillVersion = {
  version_no: number;
  content_hash: string;
  has_scripts: boolean;
  source_ref: string | null;
  /** A user id, or "evolution". */
  created_by: string;
  created_at: number;
  manifest: unknown;
};

export type SkillSourceDetail = {
  skill: SkillGovernance;
  source: SkillSource | null;
  /** Newest first. */
  versions: SkillVersion[];
};

export type SkillSourceSyncResult = {
  skill: SkillGovernance;
  source: SkillSource;
  version: SkillVersion;
  /** false: the source had no changes. */
  changed: boolean;
};

/** Only a human decision; there is deliberately no auto-apply variant. */
export type SkillReviewDecision = 'approve' | 'reject';

export type SkillSourceImportKind = 'url' | 'git' | 'local';

export type SkillSourceImportRequest = {
  kind: SkillSourceImportKind;
  /** https URL (url / git) or an absolute local directory (local). */
  locator: string;
  ref?: string;
  subpath?: string;
  origin_app?: 'claude' | 'codex';
};
