/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** M8 E7 Squad templates — wire types for /api/squads (aioncore #189, E7-1). */

export type SquadLeaderMode = 'route_only' | 'route_and_work';
export type SquadVisibility = 'private' | 'team';

export type SquadMember = {
  assistant_id: string;
  /** 1..60 chars. */
  role_title: string;
  /** ≤2000 chars; backend default "". */
  role_description: string;
  /** 1..4; backend default 1. */
  max_parallel: number;
};

/** `missing=true` means the reference is gone and `name` falls back to the id. */
export type AssistantBrief = {
  id: string;
  name: string;
  enabled: boolean;
  missing: boolean;
};

export type SquadTemplate = {
  id: string;
  name: string;
  description: string;
  leader_assistant_id: string;
  leader_mode: SquadLeaderMode;
  members: SquadMember[];
  visibility: SquadVisibility;
  team_id: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  leader: AssistantBrief | null;
  member_assistants: AssistantBrief[];
};

export type SquadTemplateInput = {
  name: string;
  description?: string;
  leader_assistant_id: string;
  leader_mode?: SquadLeaderMode;
  members: Array<Pick<SquadMember, 'assistant_id' | 'role_title'> & Partial<SquadMember>>;
  visibility?: SquadVisibility;
};

export type SquadTemplatePatch = Partial<SquadTemplateInput> & {
  /** Optimistic lock; required by the backend. */
  expected_updated_at: number;
};

/** Leader included (D7-5). */
export const SQUAD_MAX_TOTAL = 6;
export const SQUAD_MAX_MEMBERS = SQUAD_MAX_TOTAL - 1;
export const SQUAD_NAME_MAX = 100;
export const SQUAD_DESCRIPTION_MAX = 2000;
export const SQUAD_ROLE_TITLE_MAX = 60;
export const SQUAD_ROLE_DESCRIPTION_MAX = 2000;
export const SQUAD_MAX_PARALLEL = 4;

// ---------------------------------------------------------------------------
// M8 E7-2: member-config preview + instantiation
// ---------------------------------------------------------------------------

/** Hard rule: no participant of a Squad team may spawn/add agents. */
export const SQUAD_SUBAGENT_SPAWN_FORBIDDEN = 'forbidden';

export type SquadPreviewParticipant = {
  assistant_id: string;
  /** Agent slot name the Team will use (role_title for members, de-duplicated). */
  agent_name: string;
  role: 'lead' | 'teammate';
  role_title: string;
  role_description: string;
  max_parallel: number;
  assistant: AssistantBrief;
  backend: string | null;
  /** false when the assistant is no longer team-selectable. */
  eligible: boolean;
  subagent_spawn: string;
  /** Leader only, route_only: Team MCP tools it keeps. Absent = unrestricted. */
  team_tools?: string[];
};

export type SquadPreviewBlocker = {
  code: string;
  assistant_id?: string;
};

/** GET /api/squads/{id}/preview */
export type SquadPreview = {
  squad_template_id: string;
  name: string;
  leader_mode: SquadLeaderMode;
  /** Leader first, then members in template order. */
  participants: SquadPreviewParticipant[];
  can_instantiate: boolean;
  blocking: SquadPreviewBlocker[];
};

/** POST /api/squads/{id}/instantiate body (all optional). */
export type SquadInstantiateInput = {
  name?: string;
  workspace?: string;
};
