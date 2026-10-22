import { describe, expect, it } from 'vitest';
import { INHERIT_MCP_COPY, mcpPolicyChip } from '@/renderer/pages/agent-center/mcpPolicyCopy';

describe('C-05 inherit MCP policy copy', () => {
  it('describes the real behavior (previous session selection), not the globally enabled set', () => {
    for (const text of Object.values(INHERIT_MCP_COPY)) {
      expect(text).toContain('沿用上次');
      expect(text).not.toContain('已启用');
      expect(text).not.toContain('继承用户');
    }
  });

  it('maps both policies to their chip label', () => {
    expect(mcpPolicyChip('allowlist')).toBe('MCP 白名单');
    expect(mcpPolicyChip('inherit_user_enabled')).toBe(INHERIT_MCP_COPY.chip);
  });
});
