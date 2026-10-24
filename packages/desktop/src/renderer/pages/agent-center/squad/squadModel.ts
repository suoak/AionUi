/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import {
  SQUAD_DESCRIPTION_MAX,
  SQUAD_MAX_MEMBERS,
  SQUAD_MAX_PARALLEL,
  SQUAD_NAME_MAX,
  SQUAD_ROLE_DESCRIPTION_MAX,
  SQUAD_ROLE_TITLE_MAX,
  type SquadPreview,
  type SquadTemplate,
  type SquadTemplateInput,
} from '@/common/types/agent/squad';

const KNOWN_ERRORS = new Set([
  'squad_invalid_body',
  'squad_invalid_name',
  'squad_invalid_description',
  'squad_leader_required',
  'squad_no_members',
  'squad_too_many_members',
  'squad_invalid_member',
  'squad_member_duplicate',
  'squad_assistant_not_eligible',
  'squad_team_visibility_unavailable',
  'squad_not_found',
  'squad_name_conflict',
  'squad_stale',
  'squad_in_use',
  'squad_store_failed',
  'squad_assistant_catalog_unavailable',
  'squad_instantiate_unavailable',
  'squad_spawn_forbidden',
  'squad_leader_backend_unenforceable',
]);

/** Squad routes put the specific reason in `code`; fall back to the `code:` message prefix. */
export const squadErrorReason = (error: unknown): string | null => {
  if (!isBackendHttpError(error)) return null;
  if (KNOWN_ERRORS.has(error.code)) return error.code;
  const prefix = /^([a-z][a-z0-9_]*)(?::|$)/.exec(error.backendMessage.trim())?.[1];
  if (prefix && KNOWN_ERRORS.has(prefix)) return prefix;
  return error.status === 403 ? 'forbidden' : null;
};

export const squadErrorKey = (error: unknown): string =>
  `agent.agentCenter.squad.errors.${squadErrorReason(error) ?? 'generic'}`;

export const isSquadStale = (error: unknown): boolean => squadErrorReason(error) === 'squad_stale';

/** Team ids that still reference the template (409 squad_in_use details). */
export const squadInUseTeamIds = (error: unknown): string[] => {
  if (!isBackendHttpError(error) || squadErrorReason(error) !== 'squad_in_use') return [];
  const ids = (error.details as { team_ids?: unknown } | null | undefined)?.team_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
};

export type SquadValidationIssue =
  | { reason: 'squad_invalid_name' | 'squad_invalid_description' | 'squad_leader_required' | 'squad_no_members' }
  | { reason: 'squad_too_many_members' }
  | { reason: 'squad_member_duplicate'; assistant_id: string }
  | {
      reason: 'squad_invalid_member';
      index: number;
      field: 'assistant_id' | 'role_title' | 'role_description' | 'max_parallel';
    };

/**
 * Client-side pre-check mirroring the backend rules. Eligibility of an
 * assistant is backend-only (`squad_assistant_not_eligible`).
 */
export const validateSquadInput = (input: SquadTemplateInput): SquadValidationIssue | null => {
  const name = input.name.trim();
  if (!name || name.length > SQUAD_NAME_MAX) return { reason: 'squad_invalid_name' };
  if ((input.description ?? '').length > SQUAD_DESCRIPTION_MAX) return { reason: 'squad_invalid_description' };
  if (!input.leader_assistant_id.trim()) return { reason: 'squad_leader_required' };
  if (input.members.length === 0) return { reason: 'squad_no_members' };
  if (input.members.length > SQUAD_MAX_MEMBERS) return { reason: 'squad_too_many_members' };
  const seen = new Set([input.leader_assistant_id]);
  for (const [index, m] of input.members.entries()) {
    if (!m.assistant_id.trim()) return { reason: 'squad_invalid_member', index, field: 'assistant_id' };
    const title = m.role_title.trim();
    if (!title || title.length > SQUAD_ROLE_TITLE_MAX)
      return { reason: 'squad_invalid_member', index, field: 'role_title' };
    if ((m.role_description ?? '').length > SQUAD_ROLE_DESCRIPTION_MAX)
      return { reason: 'squad_invalid_member', index, field: 'role_description' };
    const mp = m.max_parallel ?? 1;
    if (!Number.isInteger(mp) || mp < 1 || mp > SQUAD_MAX_PARALLEL)
      return { reason: 'squad_invalid_member', index, field: 'max_parallel' };
    if (seen.has(m.assistant_id)) return { reason: 'squad_member_duplicate', assistant_id: m.assistant_id };
    seen.add(m.assistant_id);
  }
  return null;
};

/** Editable draft from a stored template (for the PATCH editor). */
export const squadToInput = (squad: SquadTemplate): SquadTemplateInput => ({
  name: squad.name,
  description: squad.description,
  leader_assistant_id: squad.leader_assistant_id,
  leader_mode: squad.leader_mode,
  members: squad.members.map((m) => ({ ...m })),
  visibility: squad.visibility,
});

/** Assistant references that no longer resolve (leader or members). */
export const missingSquadRefs = (squad: SquadTemplate): string[] =>
  [squad.leader, ...squad.member_assistants].filter((a) => a?.missing).map((a) => a!.id);

/** i18n key for a client-side validation issue (shares the backend error copy). */
export const squadIssueKey = (issue: SquadValidationIssue): string => `agent.agentCenter.squad.errors.${issue.reason}`;

/** Assistant id named by a 400 squad_assistant_not_eligible. */
export const squadIneligibleAssistantId = (error: unknown): string | null => {
  if (!isBackendHttpError(error) || squadErrorReason(error) !== 'squad_assistant_not_eligible') return null;
  const id = (error.details as { assistant_id?: unknown } | null | undefined)?.assistant_id;
  return typeof id === 'string' ? id : null;
};

/** Leader named by a 400 squad_leader_backend_unenforceable (details `{assistant_id, backend}`). */
export const squadUnenforceableLeader = (error: unknown): { assistantId?: string; backend?: string } | null => {
  if (!isBackendHttpError(error) || squadErrorReason(error) !== 'squad_leader_backend_unenforceable') return null;
  const details = (error.details ?? {}) as { assistant_id?: unknown; backend?: unknown };
  return {
    assistantId: typeof details.assistant_id === 'string' ? details.assistant_id : undefined,
    backend: typeof details.backend === 'string' ? details.backend : undefined,
  };
};

/** Known preview blocker codes get a specific message; anything else falls back to generic. */
const KNOWN_BLOCKERS = new Set([
  'squad_assistant_not_eligible',
  'squad_team_visibility_unavailable',
  'squad_leader_backend_unenforceable',
]);

export type SquadBlockerView = { key: string; assistantName?: string };

/** Human-facing blockers for a preview, resolving assistant ids to names where possible. */
export const squadPreviewBlockers = (preview: SquadPreview): SquadBlockerView[] =>
  preview.blocking.map((b) => {
    const key = `agent.agentCenter.squad.preview.blockers.${KNOWN_BLOCKERS.has(b.code) ? b.code : 'generic'}`;
    if (!b.assistant_id) return { key };
    const p = preview.participants.find((x) => x.assistant_id === b.assistant_id);
    return { key, assistantName: p?.assistant.name || b.assistant_id };
  });
