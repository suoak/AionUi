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
