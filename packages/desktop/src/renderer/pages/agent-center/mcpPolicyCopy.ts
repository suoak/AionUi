import type { AgentMcpPolicy } from '@/common/types/agent/agentCenterTypes';

/**
 * C-05: user-facing copy for the "inherit" MCP policy.
 *
 * `inherit_user_enabled` does NOT mount the MCP servers the user enabled in
 * settings: the conversation reuses the MCP selection of the previous Guid
 * session (`last_mcp_ids`). The copy must say that instead of promising the
 * globally enabled set.
 */
export const INHERIT_MCP_COPY = {
  option: '沿用上次会话的 MCP 选择',
  short: '沿用上次选择',
  chip: 'MCP 沿用上次选择',
} as const;

export const mcpPolicyChip = (policy: AgentMcpPolicy): string =>
  policy === 'allowlist' ? 'MCP 白名单' : INHERIT_MCP_COPY.chip;
