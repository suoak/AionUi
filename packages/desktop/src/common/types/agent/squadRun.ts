/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M8 E7-5 — derived run state of a Squad-instantiated Team.
 * Wire shape of `GET /api/teams/{id}/squad-run` (aioncore #193).
 * Core derives it from the team task board + in-memory team-run manager;
 * nothing is stored, so after a Core restart `failed` can no longer appear.
 */
export type SquadRunState = 'waiting_backlog' | 'running' | 'paused' | 'finished' | 'failed';

export const SQUAD_RUN_STATES: readonly SquadRunState[] = [
  'waiting_backlog',
  'running',
  'paused',
  'finished',
  'failed',
];

export type SquadRunPayload = {
  team_id: string;
  state: SquadRunState;
  leader_conversation_id: string | null;
  /** `route_only` | other template leader modes; null if unset. */
  leader_mode: string | null;
  /** Epoch ms: newest task update, falling back to the team's `updated_at`. */
  updated_at: number;
};

/** 404 code for teams that were not instantiated from a Squad. */
export const TEAM_NOT_SQUAD = 'team_not_squad';

/** Normalize the wire value; anything without a known `state` is "no run yet" (null). */
export function toSquadRunPayload(raw: unknown): SquadRunPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const state = r.state;
  if (typeof state !== 'string' || !(SQUAD_RUN_STATES as readonly string[]).includes(state)) return null;
  return {
    team_id: typeof r.team_id === 'string' ? r.team_id : '',
    state: state as SquadRunState,
    leader_conversation_id:
      typeof r.leader_conversation_id === 'string' && r.leader_conversation_id ? r.leader_conversation_id : null,
    leader_mode: typeof r.leader_mode === 'string' && r.leader_mode ? r.leader_mode : null,
    updated_at: typeof r.updated_at === 'number' && Number.isFinite(r.updated_at) ? r.updated_at : 0,
  };
}
