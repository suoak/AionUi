/**
 * Mirror of aionui-api-types/src/agent_center.rs (CSBU WorkMate 智能体中心).
 */

import type { Assistant, AssistantDetail } from './assistantTypes';

export type AgentVisibility = 'private' | 'team' | 'enterprise';
export type AgentPublishStatus = 'draft' | 'published' | 'archived';
export type AgentMcpPolicy = 'allowlist' | 'inherit_user_enabled';
export type SkillVersionPolicy = 'pin' | 'latest';
export type AgentAclRole = 'owner' | 'editor' | 'user';

export interface AgentSkillRef {
  skill_key: string;
  source?: string;
  version_policy: SkillVersionPolicy;
  pinned_version?: string;
}

export interface KnowledgeScopeRef {
  knowhub_space_id: string;
  node_ids?: string[];
  access: string;
}

export interface AgentRoleBinding {
  subject_type: string;
  subject_id: string;
  role: AgentAclRole;
}

export interface AgentCenterMeta {
  visibility: AgentVisibility;
  team_id?: string;
  enterprise_id?: string;
  status: AgentPublishStatus;
  version: number;
  published_revision_id?: string;
  knowledge_scopes: KnowledgeScopeRef[];
  skill_refs: AgentSkillRef[];
  mcp_policy: AgentMcpPolicy;
  role_bindings: AgentRoleBinding[];
}

export interface AgentCenterListItem {
  assistant: Assistant;
  meta: AgentCenterMeta;
}

export interface AgentCenterDetail {
  assistant: AssistantDetail;
  meta: AgentCenterMeta;
}

export interface AgentCenterMetaPatch {
  visibility?: AgentVisibility;
  team_id?: string | null;
  enterprise_id?: string | null;
  knowledge_scopes?: KnowledgeScopeRef[];
  skill_refs?: AgentSkillRef[];
  mcp_policy?: AgentMcpPolicy;
  role_bindings?: AgentRoleBinding[];
  mcp_ids?: string[];
}

export interface CreateAgentCenterRequest {
  name: string;
  description?: string;
  agent_id?: string;
  enabled_skills?: string[];
  defaults?: {
    model?: { mode: string; value?: string };
    permission?: { mode: string; value?: string };
    skills?: { mode: string; value: string[] };
    mcps?: { mode: string; value: string[] };
  };
  meta?: AgentCenterMetaPatch;
}

export interface UpdateAgentCenterRequest {
  name?: string;
  description?: string;
  agent_id?: string;
  enabled_skills?: string[];
  defaults?: CreateAgentCenterRequest['defaults'];
  meta?: AgentCenterMetaPatch;
}

export interface PublishAgentCenterRequest {
  changelog?: string;
  pin_skills_on_publish?: boolean;
}

export interface AgentCenterRevision {
  id: string;
  revision: number;
  changelog?: string;
  created_by?: string;
  created_at: number;
}

export interface AgentCenterRunPlan {
  assistant_id: string;
  revision_id?: string;
  revision: number;
  create_conversation: {
    name?: string;
    assistant?: {
      id: string;
      locale?: string;
      conversation_overrides?: {
        model?: string;
        permission?: string;
        thought_level?: string;
        skill_ids?: string[];
        disabled_builtin_skill_ids?: string[];
        mcp_ids?: string[];
      };
    };
    extra?: Record<string, unknown>;
  };
}
