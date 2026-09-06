/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AgentWorkflowDefinition,
  AgentWorkflowNodeDefinition,
  AgentWorkflowNodeKind,
  AgentWorkflowOutputFormat,
  AgentWorkflowRun,
} from './agentCenterTypes';

const ACTIVE_WORKFLOW_STATUSES = new Set<AgentWorkflowRun['status']>(['running', 'waiting_approval']);

export const hasActiveWorkflowRuns = (runs: ReadonlyArray<Pick<AgentWorkflowRun, 'status'>>): boolean =>
  runs.some((run) => ACTIVE_WORKFLOW_STATUSES.has(run.status));

export const createDefaultWorkflowNodes = (): AgentWorkflowNodeDefinition[] => [
  { id: 'start', kind: 'start' },
  { id: 'agent', kind: 'agent' },
  { id: 'output', kind: 'output' },
];

export const buildLinearWorkflowEdges = (nodes: AgentWorkflowNodeDefinition[]) =>
  nodes.slice(0, -1).map((node, index) => ({ source: node.id, target: nodes[index + 1].id }));

export const createDefaultAgentWorkflow = (): AgentWorkflowDefinition => ({
  schema_version: 1,
  trigger: 'manual',
  input: { kind: 'text', required: true },
  output: { format: 'markdown' },
  nodes: createDefaultWorkflowNodes(),
  edges: buildLinearWorkflowEdges(createDefaultWorkflowNodes()),
});

export const createAgentWorkflow = (
  inputPlaceholder: string,
  outputFormat: AgentWorkflowOutputFormat,
  nodes: AgentWorkflowNodeDefinition[] = createDefaultWorkflowNodes()
): AgentWorkflowDefinition => ({
  ...createDefaultAgentWorkflow(),
  input: {
    kind: 'text',
    required: true,
    placeholder: inputPlaceholder.trim() || undefined,
  },
  output: { format: outputFormat },
  nodes,
  edges: buildLinearWorkflowEdges(nodes),
});

export const insertWorkflowNode = (
  nodes: AgentWorkflowNodeDefinition[],
  kind: Exclude<AgentWorkflowNodeKind, 'start' | 'agent' | 'output'>,
  id: string
): AgentWorkflowNodeDefinition[] => {
  const outputIndex = nodes.findIndex((node) => node.kind === 'output');
  const insertAt = outputIndex < 0 ? nodes.length : outputIndex;
  const node: AgentWorkflowNodeDefinition = { id, kind, config: {} };
  return [...nodes.slice(0, insertAt), node, ...nodes.slice(insertAt)];
};

export const updateWorkflowNode = (
  nodes: AgentWorkflowNodeDefinition[],
  id: string,
  patch: Pick<AgentWorkflowNodeDefinition, 'config'>
): AgentWorkflowNodeDefinition[] => nodes.map((node) => (node.id === id ? { ...node, ...patch } : node));

export const moveWorkflowNode = (
  nodes: AgentWorkflowNodeDefinition[],
  id: string,
  direction: -1 | 1
): AgentWorkflowNodeDefinition[] => {
  const index = nodes.findIndex((node) => node.id === id);
  const target = index + direction;
  if (index <= 1 || target <= 1 || target >= nodes.length - 1) return nodes;
  const result = [...nodes];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
};

export const removeWorkflowNode = (nodes: AgentWorkflowNodeDefinition[], id: string): AgentWorkflowNodeDefinition[] =>
  nodes.filter((node) => node.id !== id || ['start', 'agent', 'output'].includes(node.kind));

export type WorkflowNodeIssue = {
  nodeId: string;
  field: 'mcpServerId' | 'toolName' | 'toolArguments' | 'approvalMessage' | 'expression';
};

const hasValidToolArguments = (raw: string | undefined): boolean => {
  if (!raw?.trim()) return true;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
};

export const getWorkflowNodeIssues = (
  nodes: AgentWorkflowNodeDefinition[],
  allowedToolIds?: readonly string[]
): WorkflowNodeIssue[] =>
  nodes.flatMap<WorkflowNodeIssue>((node) => {
    if (node.kind === 'tool') {
      const serverId = node.config?.mcp_server_id?.trim() || node.config?.tool_id?.trim();
      const issues: WorkflowNodeIssue[] = [];
      if (!serverId || (allowedToolIds && !allowedToolIds.includes(serverId))) {
        issues.push({ nodeId: node.id, field: 'mcpServerId' });
      }
      if (!node.config?.tool_name?.trim()) {
        issues.push({ nodeId: node.id, field: 'toolName' });
      }
      if (!hasValidToolArguments(node.config?.arguments_json)) {
        issues.push({ nodeId: node.id, field: 'toolArguments' });
      }
      return issues;
    }
    if (node.kind === 'approval' && !node.config?.message?.trim()) {
      return [{ nodeId: node.id, field: 'approvalMessage' as const }];
    }
    if (node.kind === 'condition' && !node.config?.expression?.trim()) {
      return [{ nodeId: node.id, field: 'expression' as const }];
    }
    return [];
  });

export type AgentPublishReadiness = {
  key: 'name' | 'instructions' | 'input' | 'nodes';
  ready: boolean;
};

/** Required checks are intentionally small so drafts remain flexible. */
export const getAgentPublishReadiness = (values: {
  name: string;
  instructions: string;
  inputPlaceholder: string;
  nodes: AgentWorkflowNodeDefinition[];
  allowedToolIds?: readonly string[];
}): AgentPublishReadiness[] => [
  { key: 'name', ready: values.name.trim().length > 0 },
  { key: 'instructions', ready: values.instructions.trim().length > 0 },
  { key: 'input', ready: values.inputPlaceholder.trim().length > 0 },
  { key: 'nodes', ready: getWorkflowNodeIssues(values.nodes, values.allowedToolIds).length === 0 },
];
