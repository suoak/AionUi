import { describe, expect, it } from 'vitest';
import { AGENT_WORKFLOW_TEMPLATE_IDS, buildAgentWorkflowTemplates } from '@/common/types/agent/agentWorkflowTemplates';

describe('Agent workflow templates', () => {
  it('provides every supported enterprise starting point', () => {
    const templates = buildAgentWorkflowTemplates((key) => `translated:${key}`);

    expect(templates.map((template) => template.id)).toEqual(AGENT_WORKFLOW_TEMPLATE_IDS);
    expect(new Set(templates.map((template) => template.id)).size).toBe(templates.length);
  });

  it('keeps every template actionable', () => {
    const templates = buildAgentWorkflowTemplates((key) => key);

    expect(templates.every((template) => template.instructions && template.inputPlaceholder)).toBe(true);
    expect(templates.every((template) => template.starters.length === 1)).toBe(true);
  });

  it('uses structured output for defect handoff', () => {
    const templates = buildAgentWorkflowTemplates((key) => key);

    expect(templates.find((template) => template.id === 'defectAnalysis')?.outputFormat).toBe('json');
  });
});
