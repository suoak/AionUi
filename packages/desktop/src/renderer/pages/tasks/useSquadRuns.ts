/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { TTeam } from '@/common/types/team/teamTypes';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { isSquadRunUnavailable, squadTeamsForTemplate, type SquadTeamRun } from './squadRunModel';

/** Board has no squad-run push yet (E6 WS does not carry it): poll while visible. */
export const SQUAD_RUN_REFRESH_MS = 15_000;

/**
 * M8 E7-5: run state of every team instantiated from Squad template
 * `templateId` (a board card assigned to `{kind: 'squad', id}`).
 *
 * Teams come from the same SWR key as the sidebar team list, so no extra
 * request; each team's `GET /api/teams/{id}/squad-run` is batched under one
 * key shared by all cards and the drawer for that template. Teams whose
 * squad-run route answers 404 (`team_not_squad`, or an older Core) are
 * dropped silently.
 */
export function useSquadRuns(templateId: string): {
  teams: TTeam[];
  runs: SquadTeamRun[];
  loading: boolean;
} {
  const { user } = useAuth();
  const userId = user?.id ?? 'system_default_user';
  const { data: allTeams, isLoading: teamsLoading } = useSWR<TTeam[]>(
    `teams/${userId}`,
    () => ipcBridge.team.list.invoke({ user_id: userId }),
    { revalidateOnFocus: false }
  );
  const teams = squadTeamsForTemplate(allTeams, templateId);
  const teamIds = teams.map((team) => team.id);
  const { data: runs, isLoading: runsLoading } = useSWR<SquadTeamRun[]>(
    teamIds.length > 0 ? ['squad-runs', templateId, ...teamIds] : null,
    async () => {
      const settled = await Promise.all(
        teams.map(async (team): Promise<SquadTeamRun | undefined> => {
          try {
            return { team, run: await ipcBridge.team.getSquadRun.invoke({ team_id: team.id }) };
          } catch (error) {
            if (isSquadRunUnavailable(error)) return undefined;
            throw error;
          }
        })
      );
      return settled.filter((entry): entry is SquadTeamRun => entry !== undefined);
    },
    { refreshInterval: SQUAD_RUN_REFRESH_MS, revalidateOnFocus: true, shouldRetryOnError: false }
  );
  return { teams, runs: runs ?? [], loading: teamsLoading || runsLoading };
}
