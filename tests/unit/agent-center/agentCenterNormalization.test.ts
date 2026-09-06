/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeAgentCenterDetail,
  normalizeAgentCenterListItem,
} from '@/common/types/agent/agentCenterNormalization';

describe('Agent Center sparse response normalization', () => {
  it('restores collections omitted from a detail response when empty', () => {
    const detail = normalizeAgentCenterDetail({
      assistant: {
        id: 'bare:632f31d2',
        source: 'generated',
        agent_status: 'online',
        team_selectable: true,
        deletable: true,
        profile: { name: 'Example agent' },
        state: { enabled: true, sort_order: 0 },
        engine: { agent_id: 'aionrs' },
        rules: { content: '', storage_mode: 'inline' },
        prompts: {},
        defaults: {
          model: { mode: 'auto' },
          permission: { mode: 'auto' },
          thought_level: { mode: 'auto' },
          skills: { mode: 'fixed' },
          mcps: { mode: 'fixed' },
        },
        capabilities: {},
        preferences: {},
      },
      meta: {
        visibility: 'private',
        status: 'draft',
        version: 0,
        mcp_policy: 'inherit_user_enabled',
      },
    });

    expect(detail.meta.skill_refs).toEqual([]);
    expect(detail.meta.knowledge_scopes).toEqual([]);
    expect(detail.meta.role_bindings).toEqual([]);
    expect(detail.assistant.prompts.recommended).toEqual([]);
    expect(detail.assistant.defaults.skills.value).toEqual([]);
    expect(detail.assistant.defaults.mcps.value).toEqual([]);
    expect(detail.assistant.capabilities.default_skill_ids).toEqual([]);
    expect(detail.assistant.preferences.last_mcp_ids).toEqual([]);
    expect(detail.meta.workflow.nodes.map((node) => node.kind)).toEqual(['start', 'agent', 'output']);
  });

  it('restores collections omitted from a list row when empty', () => {
    const item = normalizeAgentCenterListItem({
      assistant: {
        id: 'bare:632f31d2',
        source: 'generated',
        name: 'Example agent',
        enabled: true,
        sort_order: 0,
        agent_id: 'aionrs',
        agent_status: 'online',
        team_selectable: true,
        deletable: true,
      },
      meta: {
        visibility: 'private',
        status: 'draft',
        version: 0,
        mcp_policy: 'inherit_user_enabled',
      },
    });

    expect(item.meta.skill_refs).toEqual([]);
    expect(item.assistant.enabled_skills).toEqual([]);
    expect(item.assistant.prompts).toEqual([]);
  });
});
