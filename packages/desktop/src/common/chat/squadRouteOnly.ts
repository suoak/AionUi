/**
 * M8 E7-3: a route_only Squad Leader may only call routing tools. Core rejects
 * any other team tool with TeamToolErrorCode::PermissionDenied and
 * `details.code === 'squad_route_only_tool_forbidden'` (`{team_id, tool, allowed}`).
 *
 * The rejection reaches chat as a failed tool call. Depending on the backend we
 * may see the structured MCP payload (`structuredContent` / `{code, message, details}`)
 * or only the plain-text message, so both shapes are recognised here.
 */

export const SQUAD_ROUTE_ONLY_TOOL_FORBIDDEN = 'squad_route_only_tool_forbidden';

/** Mirrors Core `SQUAD_ROUTE_ONLY_LEADER_TOOLS`; used when only the text message is available. */
export const SQUAD_ROUTE_ONLY_LEADER_TOOLS = [
  'team_send_message',
  'team_task_update',
  'team_task_list',
  'team_describe_assistant',
] as const;

export type SquadRouteOnlyRejection = {
  tool: string;
  allowed: string[];
  teamId?: string;
};

const MESSAGE_PATTERN = /Squad Leader is route_only; tool ([\w.:\-/]+) is not allowed/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fromDetails = (details: unknown): SquadRouteOnlyRejection | null => {
  if (!isRecord(details) || details.code !== SQUAD_ROUTE_ONLY_TOOL_FORBIDDEN) return null;
  const tool = typeof details.tool === 'string' ? details.tool : '';
  const allowed = Array.isArray(details.allowed)
    ? details.allowed.filter((item): item is string => typeof item === 'string')
    : [...SQUAD_ROUTE_ONLY_LEADER_TOOLS];
  return {
    tool,
    allowed: allowed.length > 0 ? allowed : [...SQUAD_ROUTE_ONLY_LEADER_TOOLS],
    teamId: typeof details.team_id === 'string' ? details.team_id : undefined,
  };
};

const fromObject = (value: Record<string, unknown>, depth: number): SquadRouteOnlyRejection | null => {
  const direct = fromDetails(value.details) ?? fromDetails(value);
  if (direct) return direct;
  if (depth <= 0) return null;
  for (const key of ['structuredContent', 'structured_content', 'error', 'result', 'output']) {
    const nested = value[key];
    if (isRecord(nested)) {
      const found = fromObject(nested, depth - 1);
      if (found) return found;
    } else if (typeof nested === 'string') {
      const found = fromText(nested, depth - 1);
      if (found) return found;
    }
  }
  if (Array.isArray(value.content)) {
    for (const item of value.content) {
      if (isRecord(item) && typeof item.text === 'string') {
        const found = fromText(item.text, depth - 1);
        if (found) return found;
      }
    }
  }
  return null;
};

const fromText = (text: string, depth: number): SquadRouteOnlyRejection | null => {
  if (!text.includes('route_only') && !text.includes(SQUAD_ROUTE_ONLY_TOOL_FORBIDDEN)) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRecord(parsed)) {
        const found = fromObject(parsed, depth);
        if (found) return found;
      }
    } catch {
      // not JSON; fall through to the message pattern
    }
  }
  const match = MESSAGE_PATTERN.exec(text);
  if (!match) return null;
  return { tool: match[1], allowed: [...SQUAD_ROUTE_ONLY_LEADER_TOOLS] };
};

/** Detect a route_only Squad Leader tool rejection in any tool-call output shape. */
export const parseSquadRouteOnlyRejection = (...sources: unknown[]): SquadRouteOnlyRejection | null => {
  for (const source of sources) {
    if (typeof source === 'string') {
      const found = fromText(source, 3);
      if (found) return found;
    } else if (isRecord(source)) {
      const found = fromObject(source, 3);
      if (found) return found;
    }
  }
  return null;
};
