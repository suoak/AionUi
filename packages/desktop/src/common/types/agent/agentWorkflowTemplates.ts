/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentWorkflowOutputFormat } from './agentCenterTypes';

export const AGENT_WORKFLOW_TEMPLATE_IDS = [
  'codeReview',
  'defectAnalysis',
  'documentAnalysis',
  'testPlan',
  'weeklyReport',
  'technicalResearch',
] as const;

export type AgentWorkflowTemplateId = (typeof AGENT_WORKFLOW_TEMPLATE_IDS)[number];

export type AgentWorkflowTemplate = {
  id: AgentWorkflowTemplateId;
  name: string;
  description: string;
  instructions: string;
  inputPlaceholder: string;
  outputFormat: AgentWorkflowOutputFormat;
  starters: string[];
};

type Translate = (key: string) => string;

export const buildAgentWorkflowTemplates = (t: Translate): AgentWorkflowTemplate[] =>
  AGENT_WORKFLOW_TEMPLATE_IDS.map((id) => ({
    id,
    name: t(`agent.agentCenter.templates.${id}.name`),
    description: t(`agent.agentCenter.templates.${id}.description`),
    instructions: t(`agent.agentCenter.templates.${id}.instructions`),
    inputPlaceholder: t(`agent.agentCenter.templates.${id}.inputPlaceholder`),
    outputFormat: id === 'defectAnalysis' ? 'json' : 'markdown',
    starters: [t(`agent.agentCenter.templates.${id}.starter`)],
  }));
