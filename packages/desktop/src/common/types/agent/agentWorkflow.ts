/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentWorkflowDefinition, AgentWorkflowOutputFormat } from './agentCenterTypes';

export const createDefaultAgentWorkflow = (): AgentWorkflowDefinition => ({
  schema_version: 1,
  trigger: 'manual',
  input: { kind: 'text', required: true },
  output: { format: 'markdown' },
  nodes: [
    { id: 'start', kind: 'start' },
    { id: 'agent', kind: 'agent' },
    { id: 'output', kind: 'output' },
  ],
  edges: [
    { source: 'start', target: 'agent' },
    { source: 'agent', target: 'output' },
  ],
});

export const createAgentWorkflow = (
  inputPlaceholder: string,
  outputFormat: AgentWorkflowOutputFormat
): AgentWorkflowDefinition => ({
  ...createDefaultAgentWorkflow(),
  input: {
    kind: 'text',
    required: true,
    placeholder: inputPlaceholder.trim() || undefined,
  },
  output: { format: outputFormat },
});

export type AgentPublishReadiness = {
  key: 'name' | 'instructions' | 'input';
  ready: boolean;
};

/** Required checks are intentionally small so drafts remain flexible. */
export const getAgentPublishReadiness = (values: {
  name: string;
  instructions: string;
  inputPlaceholder: string;
}): AgentPublishReadiness[] => [
  { key: 'name', ready: values.name.trim().length > 0 },
  { key: 'instructions', ready: values.instructions.trim().length > 0 },
  { key: 'input', ready: values.inputPlaceholder.trim().length > 0 },
];
