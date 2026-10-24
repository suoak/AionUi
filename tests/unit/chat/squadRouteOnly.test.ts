import { describe, expect, it } from 'vitest';
import { SQUAD_ROUTE_ONLY_LEADER_TOOLS, parseSquadRouteOnlyRejection } from '@/common/chat/squadRouteOnly';

const DETAILS = {
  code: 'squad_route_only_tool_forbidden',
  team_id: 't1',
  tool: 'team_spawn_agent',
  allowed: ['team_send_message', 'team_task_list'],
};

describe('parseSquadRouteOnlyRejection', () => {
  it('reads the structured TeamToolErrorPayload', () => {
    expect(parseSquadRouteOnlyRejection({ code: 'permission_denied', message: 'x', details: DETAILS })).toEqual({
      tool: 'team_spawn_agent',
      allowed: ['team_send_message', 'team_task_list'],
      teamId: 't1',
    });
  });

  it('reads MCP structuredContent and JSON text', () => {
    const mcp = {
      content: [{ type: 'text', text: 'Squad Leader is route_only; tool team_spawn_agent is not allowed' }],
      isError: true,
      structuredContent: { code: 'permission_denied', message: 'x', details: DETAILS },
    };
    expect(parseSquadRouteOnlyRejection(mcp)?.teamId).toBe('t1');
    expect(parseSquadRouteOnlyRejection(JSON.stringify(mcp))?.allowed).toEqual(DETAILS.allowed);
  });

  it('falls back to the plain-text message with the default allow list', () => {
    expect(
      parseSquadRouteOnlyRejection('Error: Squad Leader is route_only; tool team_task_create is not allowed')
    ).toEqual({ tool: 'team_task_create', allowed: [...SQUAD_ROUTE_ONLY_LEADER_TOOLS] });
  });

  it('checks every source in order and ignores unrelated errors', () => {
    expect(parseSquadRouteOnlyRejection(undefined, 'ENOENT', { details: { code: 'other' } })).toBeNull();
    expect(parseSquadRouteOnlyRejection('ENOENT', { details: DETAILS })?.tool).toBe('team_spawn_agent');
    expect(parseSquadRouteOnlyRejection('{"route_only": broken json')).toBeNull();
  });
});
