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
  // E16 Office/Deck: agents whose deliverable is a real Office file.
  'executiveDeck',
  'officeBrief',
  'spreadsheetReport',
] as const;

export type AgentWorkflowTemplateId = (typeof AGENT_WORKFLOW_TEMPLATE_IDS)[number];

export type AgentWorkflowTemplateCategory = 'engineering' | 'office';

/** Office file a template produces (chat reply stays `outputFormat`). */
export type AgentWorkflowDeliverable = 'pptx' | 'docx' | 'xlsx';

export type AgentWorkflowTemplate = {
  id: AgentWorkflowTemplateId;
  category: AgentWorkflowTemplateCategory;
  name: string;
  description: string;
  instructions: string;
  inputPlaceholder: string;
  /** Format of the agent's chat reply; Office templates summarize the file they wrote in Markdown. */
  outputFormat: AgentWorkflowOutputFormat;
  /** Office file the agent is expected to write, if any. */
  deliverable?: AgentWorkflowDeliverable;
  starters: string[];
};

type Translate = (key: string) => string;

const OFFICE_DELIVERABLES: Partial<Record<AgentWorkflowTemplateId, AgentWorkflowDeliverable>> = {
  executiveDeck: 'pptx',
  officeBrief: 'docx',
  spreadsheetReport: 'xlsx',
};

const OUTPUT_FORMATS: Partial<Record<AgentWorkflowTemplateId, AgentWorkflowOutputFormat>> = {
  defectAnalysis: 'json',
};

export const AGENT_WORKFLOW_TEMPLATE_CATEGORIES: readonly AgentWorkflowTemplateCategory[] = [
  'office',
  'engineering',
] as const;

export const buildAgentWorkflowTemplates = (t: Translate): AgentWorkflowTemplate[] =>
  AGENT_WORKFLOW_TEMPLATE_IDS.map((id) => {
    const deliverable = OFFICE_DELIVERABLES[id];
    const base = `agent.agentCenter.templates.${id}`;
    const template: AgentWorkflowTemplate = {
      id,
      category: deliverable ? 'office' : 'engineering',
      name: t(`${base}.name`),
      description: t(`${base}.description`),
      instructions: t(`${base}.instructions`),
      inputPlaceholder: t(`${base}.inputPlaceholder`),
      outputFormat: OUTPUT_FORMATS[id] ?? 'markdown',
      // Office templates offer a second starter: draft from scratch vs. revise an existing file.
      starters: deliverable ? [t(`${base}.starter`), t(`${base}.starterRevise`)] : [t(`${base}.starter`)],
    };
    if (deliverable) template.deliverable = deliverable;
    return template;
  });
