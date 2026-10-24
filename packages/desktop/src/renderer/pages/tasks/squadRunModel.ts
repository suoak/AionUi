/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { SquadRunPayload, SquadRunState } from '@/common/types/agent/squadRun';
import { TEAM_NOT_SQUAD } from '@/common/types/agent/squadRun';
import type { TTeam } from '@/common/types/team/teamTypes';

/** Arco Tag colors per derived Squad run state. */
export const SQUAD_RUN_COLOR: Record<SquadRunState, string> = {
  waiting_backlog: 'gold',
  running: 'arcoblue',
  paused: 'gray',
  finished: 'green',
  failed: 'red',
};

/** Higher wins when one Squad template backs several teams (card shows one badge). */
const STATE_PRIORITY: Record<SquadRunState, number> = {
  running: 5,
  failed: 4,
  waiting_backlog: 3,
  paused: 2,
  finished: 1,
};

/** One Squad-instantiated team and its run state (`null` = no tasks and no run yet). */
export type SquadTeamRun = { team: TTeam; run: SquadRunPayload | null };

/** Teams instantiated from `templateId`, most recently updated first. */
export function squadTeamsForTemplate(teams: readonly TTeam[] | undefined, templateId: string): TTeam[] {
  if (!teams || !templateId) return [];
  return teams
    .filter((team) => team.squad_template_id === templateId)
    .toSorted((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));
}

/** The run to summarize on a card: most "attention-worthy" state, then newest. */
export function primarySquadRun(runs: readonly SquadTeamRun[]): SquadTeamRun | null {
  let best: SquadTeamRun | null = null;
  for (const entry of runs) {
    if (!entry.run) continue;
    if (
      !best?.run ||
      STATE_PRIORITY[entry.run.state] > STATE_PRIORITY[best.run.state] ||
      (STATE_PRIORITY[entry.run.state] === STATE_PRIORITY[best.run.state] && entry.run.updated_at > best.run.updated_at)
    ) {
      best = entry;
    }
  }
  return best;
}

/**
 * 404 from the squad-run route: `team_not_squad`, or a Core without the route
 * (pre-#193). Either way the team simply has no Squad run to show.
 */
export function isSquadRunUnavailable(error: unknown): boolean {
  return isBackendHttpError(error) && (error.code === TEAM_NOT_SQUAD || error.status === 404);
}
