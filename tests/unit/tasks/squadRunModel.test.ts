/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { fromBackendTeam } from '@/common/adapter/teamMapper';
import { toSquadRunPayload } from '@/common/types/agent/squadRun';
import type { TTeam } from '@/common/types/team/teamTypes';
import {
  isSquadRunUnavailable,
  primarySquadRun,
  squadTeamsForTemplate,
  type SquadTeamRun,
} from '@/renderer/pages/tasks/squadRunModel';

const team = (id: string, squad_template_id?: string, updated_at = 0) =>
  ({ id, name: id, squad_template_id, updated_at }) as unknown as TTeam;

const entry = (id: string, state: SquadTeamRun['run']): SquadTeamRun => ({
  team: team(id),
  run: state,
});

const run = (state: NonNullable<SquadTeamRun['run']>['state'], updated_at = 1) => ({
  team_id: 't',
  state,
  leader_conversation_id: null,
  leader_mode: null,
  updated_at,
});

describe('toSquadRunPayload', () => {
  it('keeps the #193 wire shape', () => {
    expect(
      toSquadRunPayload({
        team_id: 't1',
        state: 'waiting_backlog',
        leader_conversation_id: 'c1',
        leader_mode: 'route_only',
        updated_at: 42,
      })
    ).toEqual({
      team_id: 't1',
      state: 'waiting_backlog',
      leader_conversation_id: 'c1',
      leader_mode: 'route_only',
      updated_at: 42,
    });
  });

  it('maps null / unknown state / garbage to null', () => {
    expect(toSquadRunPayload(null)).toBeNull();
    expect(toSquadRunPayload({ success: true })).toBeNull();
    expect(toSquadRunPayload({ team_id: 't', state: 'exploded' })).toBeNull();
  });

  it('defaults missing optional fields', () => {
    expect(toSquadRunPayload({ state: 'running' })).toEqual({
      team_id: '',
      state: 'running',
      leader_conversation_id: null,
      leader_mode: null,
      updated_at: 0,
    });
  });
});

describe('fromBackendTeam squad_template_id', () => {
  it('passes through when set, omits when absent', () => {
    expect(fromBackendTeam({ id: 't', squad_template_id: 'sq1' }).squad_template_id).toBe('sq1');
    expect('squad_template_id' in fromBackendTeam({ id: 't' })).toBe(false);
  });
});

describe('squadTeamsForTemplate', () => {
  it('filters by template and sorts newest first', () => {
    const teams = [team('a', 'sq1', 1), team('b', 'sq2', 5), team('c', 'sq1', 9), team('d', undefined, 10)];
    expect(squadTeamsForTemplate(teams, 'sq1').map((t) => t.id)).toEqual(['c', 'a']);
    expect(squadTeamsForTemplate(undefined, 'sq1')).toEqual([]);
    expect(squadTeamsForTemplate(teams, '')).toEqual([]);
  });
});

describe('primarySquadRun', () => {
  it('prefers running > failed > waiting_backlog > paused > finished', () => {
    expect(primarySquadRun([entry('a', run('finished')), entry('b', run('paused'))])?.team.id).toBe('b');
    expect(primarySquadRun([entry('a', run('failed')), entry('b', run('running'))])?.team.id).toBe('b');
    expect(primarySquadRun([entry('a', run('waiting_backlog')), entry('b', run('failed'))])?.team.id).toBe('b');
  });

  it('breaks ties by newest updated_at and skips null runs', () => {
    expect(primarySquadRun([entry('a', run('paused', 1)), entry('b', run('paused', 7))])?.team.id).toBe('b');
    expect(primarySquadRun([entry('a', null)])).toBeNull();
    expect(primarySquadRun([])).toBeNull();
  });
});

describe('isSquadRunUnavailable', () => {
  const err = (status: number, code: string) =>
    new BackendHttpError({ method: 'GET', path: '/x', status, body: { code, error: code } });

  it('treats team_not_squad and route-missing 404 as unavailable', () => {
    expect(isSquadRunUnavailable(err(404, 'team_not_squad'))).toBe(true);
    expect(isSquadRunUnavailable(err(404, ''))).toBe(true);
  });

  it('does not swallow other errors', () => {
    expect(isSquadRunUnavailable(err(500, 'internal'))).toBe(false);
    expect(isSquadRunUnavailable(new Error('boom'))).toBe(false);
  });
});
