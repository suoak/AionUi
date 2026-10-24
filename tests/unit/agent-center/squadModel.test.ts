import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { SquadTemplate, SquadTemplateInput } from '@/common/types/agent/squad';
import {
  isSquadStale,
  missingSquadRefs,
  squadErrorKey,
  squadErrorReason,
  squadInUseTeamIds,
  squadToInput,
  validateSquadInput,
} from '@/renderer/pages/agent-center/squad/squadModel';

const err = (status: number, body: unknown) =>
  new BackendHttpError({ method: 'POST', path: '/api/squads', status, body });

const base = (): SquadTemplateInput => ({
  name: 'Research',
  leader_assistant_id: 'lead',
  members: [{ assistant_id: 'a1', role_title: 'Writer' }],
});

describe('squadErrorReason', () => {
  it('reads the specific code', () => {
    expect(squadErrorReason(err(409, { success: false, code: 'squad_stale', error: 'squad_stale: x' }))).toBe(
      'squad_stale'
    );
  });
  it('falls back to the message prefix', () => {
    expect(squadErrorReason(err(400, { success: false, code: 'BAD_REQUEST', error: 'squad_no_members: none' }))).toBe(
      'squad_no_members'
    );
  });
  it('maps 403 and unknown', () => {
    expect(squadErrorReason(err(403, { code: 'FORBIDDEN', error: 'nope' }))).toBe('forbidden');
    expect(squadErrorKey(err(500, { code: 'INTERNAL', error: 'boom' }))).toBe('agent.agentCenter.squad.errors.generic');
    expect(squadErrorReason(new Error('x'))).toBeNull();
  });
  it('detects stale and in-use details', () => {
    expect(isSquadStale(err(409, { code: 'squad_stale', error: 'squad_stale: x' }))).toBe(true);
    const inUse = err(409, { code: 'squad_in_use', error: 'squad_in_use: t', details: { team_ids: ['t1', 2, 't2'] } });
    expect(squadInUseTeamIds(inUse)).toEqual(['t1', 't2']);
    expect(squadInUseTeamIds(err(409, { code: 'squad_stale', error: '' }))).toEqual([]);
  });
});

describe('validateSquadInput', () => {
  it('accepts a minimal squad', () => {
    expect(validateSquadInput(base())).toBeNull();
  });
  it('enforces name, leader and member presence', () => {
    expect(validateSquadInput({ ...base(), name: '  ' })?.reason).toBe('squad_invalid_name');
    expect(validateSquadInput({ ...base(), name: 'x'.repeat(101) })?.reason).toBe('squad_invalid_name');
    expect(validateSquadInput({ ...base(), leader_assistant_id: '' })?.reason).toBe('squad_leader_required');
    expect(validateSquadInput({ ...base(), members: [] })?.reason).toBe('squad_no_members');
  });
  it('caps members at 5 (6 with leader)', () => {
    const members = Array.from({ length: 5 }, (_, i) => ({ assistant_id: `a${i}`, role_title: 'R' }));
    expect(validateSquadInput({ ...base(), members })).toBeNull();
    expect(
      validateSquadInput({ ...base(), members: [...members, { assistant_id: 'a9', role_title: 'R' }] })?.reason
    ).toBe('squad_too_many_members');
  });
  it('rejects duplicates including leader as member', () => {
    expect(validateSquadInput({ ...base(), members: [{ assistant_id: 'lead', role_title: 'R' }] })).toEqual({
      reason: 'squad_member_duplicate',
      assistant_id: 'lead',
    });
  });
  it('checks member fields', () => {
    expect(validateSquadInput({ ...base(), members: [{ assistant_id: 'a1', role_title: '' }] })).toEqual({
      reason: 'squad_invalid_member',
      index: 0,
      field: 'role_title',
    });
    expect(
      validateSquadInput({ ...base(), members: [{ assistant_id: 'a1', role_title: 'R', max_parallel: 5 }] })
    ).toMatchObject({ field: 'max_parallel' });
  });
});

describe('template helpers', () => {
  const squad: SquadTemplate = {
    id: 's1',
    name: 'S',
    description: '',
    leader_assistant_id: 'lead',
    leader_mode: 'route_only',
    members: [{ assistant_id: 'a1', role_title: 'W', role_description: '', max_parallel: 1 }],
    visibility: 'private',
    team_id: null,
    created_at: 1,
    updated_at: 2,
    deleted_at: null,
    leader: { id: 'lead', name: 'Lead', enabled: true, missing: false },
    member_assistants: [{ id: 'a1', name: 'a1', enabled: false, missing: true }],
  };
  it('converts to input and lists missing refs', () => {
    expect(squadToInput(squad).members[0]).toEqual(squad.members[0]);
    expect(squadToInput(squad).members[0]).not.toBe(squad.members[0]);
    expect(missingSquadRefs(squad)).toEqual(['a1']);
  });
});

describe('squadPreviewBlockers', () => {
  it('maps known codes with assistant names and falls back to generic', async () => {
    const { squadPreviewBlockers } = await import('@/renderer/pages/agent-center/squad/squadModel');
    const out = squadPreviewBlockers({
      squad_template_id: 's',
      name: 'n',
      leader_mode: 'route_only',
      participants: [
        {
          assistant_id: 'a1',
          agent_name: 'W',
          role: 'teammate',
          role_title: 'W',
          role_description: '',
          max_parallel: 1,
          assistant: { id: 'a1', name: 'Alice', enabled: true, missing: false },
          backend: null,
          eligible: false,
          subagent_spawn: 'forbidden',
        },
      ],
      can_instantiate: false,
      blocking: [
        { code: 'squad_assistant_not_eligible', assistant_id: 'a1' },
        { code: 'squad_assistant_not_eligible', assistant_id: 'gone' },
        { code: 'squad_team_visibility_unavailable' },
        { code: 'other' },
      ],
    });
    expect(out).toEqual([
      { key: 'agent.agentCenter.squad.preview.blockers.squad_assistant_not_eligible', assistantName: 'Alice' },
      { key: 'agent.agentCenter.squad.preview.blockers.squad_assistant_not_eligible', assistantName: 'gone' },
      { key: 'agent.agentCenter.squad.preview.blockers.squad_team_visibility_unavailable' },
      { key: 'agent.agentCenter.squad.preview.blockers.generic' },
    ]);
  });
});

describe('E7-4 unenforceable Leader', () => {
  it('maps the blocker and reads instantiate error details', async () => {
    const { squadPreviewBlockers, squadUnenforceableLeader, squadErrorKey } =
      await import('@/renderer/pages/agent-center/squad/squadModel');
    expect(
      squadPreviewBlockers({
        squad_template_id: 's',
        name: 'n',
        leader_mode: 'route_only',
        participants: [],
        can_instantiate: false,
        blocking: [{ code: 'squad_leader_backend_unenforceable', assistant_id: 'x' }],
      })
    ).toEqual([
      { key: 'agent.agentCenter.squad.preview.blockers.squad_leader_backend_unenforceable', assistantName: 'x' },
    ]);
    const e = err(400, {
      success: false,
      error: 'squad_leader_backend_unenforceable',
      code: 'squad_leader_backend_unenforceable',
      details: { assistant_id: 'x', backend: 'gemini' },
    });
    expect(squadUnenforceableLeader(e)).toEqual({ assistantId: 'x', backend: 'gemini' });
    expect(squadErrorKey(e)).toBe('agent.agentCenter.squad.errors.squad_leader_backend_unenforceable');
    expect(squadUnenforceableLeader(err(400, { success: false, error: 'x', code: 'squad_invalid_body' }))).toBeNull();
  });
});
