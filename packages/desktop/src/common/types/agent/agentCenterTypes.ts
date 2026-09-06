/**
 * Mirror of aionui-api-types/src/agent_center.rs (CSBU WorkMate 智能体中心).
 */

import type { Assistant, AssistantDetail } from './assistantTypes';

export type AgentVisibility = 'private' | 'team' | 'enterprise';
export type AgentPublishStatus = 'draft' | 'published' | 'archived';
export type AgentMcpPolicy = 'allowlist' | 'inherit_user_enabled';
export type SkillVersionPolicy = 'pin' | 'latest';
export type AgentAclRole = 'owner' | 'editor' | 'user';
export type AgentWorkflowOutputFormat = 'markdown' | 'plain_text' | 'json';
export type AgentWorkflowNodeKind = 'start' | 'agent' | 'tool' | 'approval' | 'condition' | 'output';

export type AgentWorkflowNodeDefinition = {
  id: string;
  kind: AgentWorkflowNodeKind;
  label?: string;
  config?: Record<string, string>;
};

export type AgentWorkflowDefinition = {
  schema_version: 1;
  trigger: 'manual';
  input: {
    kind: 'text';
    required: boolean;
    placeholder?: string;
  };
  output: {
    format: AgentWorkflowOutputFormat;
  };
  nodes: AgentWorkflowNodeDefinition[];
  edges: Array<{ source: string; target: string }>;
};

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
  workflow: AgentWorkflowDefinition;
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
  workflow?: AgentWorkflowDefinition;
  mcp_ids?: string[];
}

export interface CreateAgentCenterRequest {
  name: string;
  description?: string;
  agent_id?: string;
  enabled_skills?: string[];
  /** ChatGPT-style conversation starters; persisted on the underlying Assistant. */
  recommended_prompts?: string[];
  defaults?: {
    model?: { mode: string; value?: string };
    permission?: { mode: string; value?: string };
    thought_level?: { mode: string; value?: string };
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
  recommended_prompts?: string[];
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

export type AgentCenterPreviewMode = 'draft' | 'published';

export interface AgentCenterRunPlan {
  assistant_id: string;
  revision_id?: string;
  revision: number;
  /** draft = try-run live/unpublished config; published = last published revision. */
  preview_mode?: AgentCenterPreviewMode;
  workflow: AgentWorkflowDefinition;
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

export type AgentWorkflowRunStatus = 'running' | 'waiting_approval' | 'completed' | 'rejected' | 'failed';
export type AgentWorkflowNodeRunStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'skipped'
  | 'rejected'
  | 'failed';

export type AgentWorkflowNodeRun = {
  node_id: string;
  kind: AgentWorkflowNodeKind;
  status: AgentWorkflowNodeRunStatus;
  output?: unknown;
  error?: string;
  started_at?: number;
  completed_at?: number;
};

export type AgentWorkflowNextAction =
  | { kind: 'run_agent'; create_conversation: AgentCenterRunPlan['create_conversation'] }
  | { kind: 'invoke_tool'; mcp_server_id: string; tool_name: string; arguments: Record<string, unknown> }
  | { kind: 'await_approval'; node_id: string; message: string };

export type AgentWorkflowRun = {
  id: string;
  assistant_id: string;
  status: AgentWorkflowRunStatus;
  current_node_index: number;
  workflow: AgentWorkflowDefinition;
  nodes: AgentWorkflowNodeRun[];
  variables: Record<string, unknown>;
  next_action?: AgentWorkflowNextAction;
  created_at: number;
  updated_at: number;
};

export type StartAgentWorkflowRunRequest = {
  input?: unknown;
  variables?: Record<string, unknown>;
};

export type AdvanceAgentWorkflowRunRequest = {
  success?: boolean;
  output?: unknown;
  error?: string;
};
