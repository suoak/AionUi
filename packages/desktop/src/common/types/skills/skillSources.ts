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

/** One changed file between two versions (aioncore E10-3). */
export type SkillFileDiff = {
  path: string;
  status: 'added' | 'removed' | 'modified' | string;
  /** Binary / non-UTF-8: listed only, never diffed. */
  binary: boolean;
  /** A script in either version. */
  script: boolean;
  /** Unified diff (3 lines of context); null for binary or oversized files. */
  diff: string | null;
  /** Text over Core's diff cap: listed only. */
  too_large: boolean;
};

export type SkillVersionDiff = {
  skill_id: string;
  from_version: number;
  to_version: number;
  /** Changed files only, sorted by path. */
  files: SkillFileDiff[];
};

export type SkillRestoreResult = {
  skill: SkillGovernance;
  /** The version the live skill now matches (new unless nothing changed). */
  version: SkillVersion;
  restored_from: number;
  /** false: the live files already matched that version. */
  changed: boolean;
};

/** One skill in the installation team library (aioncore E10-5). */
export type TeamSkill = {
  skill_id: string;
  name: string;
  description: string;
  owner_user_id: string;
  review_status: SkillReviewStatus | string;
  /** Published by the current user. */
  mine: boolean;
  updated_at: number;
};

/** `GET /api/skills/team`. `enabled` is false outside multi-user role modes. */
export type TeamSkillLibrary = {
  enabled: boolean;
  team_id: string | null;
  /** Owner / admin: may publish, unpublish and review team skills. */
  can_manage: boolean;
  skills: TeamSkill[];
};
