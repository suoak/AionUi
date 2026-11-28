import type { AgentMcpPolicy } from '@/common/types/agent/agentCenterTypes';

/**
 * C-05: user-facing copy for the "inherit" MCP policy.
 *
 * `inherit_user_enabled` does NOT mount the MCP servers the user enabled in
 * settings: the conversation reuses the MCP selection of the previous Guid
 * session (`last_mcp_ids`). The copy must say that instead of promising the
 * globally enabled set.
 */
export const INHERIT_MCP_COPY_KEYS = {
  option: 'agent.agentCenter.mcp.inheritOption',
  short: 'agent.agentCenter.mcp.inheritShort',
  chip: 'agent.agentCenter.mcp.inheritChip',
} as const;

export const MCP_ALLOWLIST_CHIP_KEY = 'agent.agentCenter.mcp.allowlistChip';

export const mcpPolicyChipKey = (policy: AgentMcpPolicy): string =>
  policy === 'allowlist' ? MCP_ALLOWLIST_CHIP_KEY : INHERIT_MCP_COPY_KEYS.chip;

export const mcpPolicyChip = (policy: AgentMcpPolicy, t: (key: string) => string): string =>
  t(mcpPolicyChipKey(policy));
