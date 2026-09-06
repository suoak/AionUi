import { describe, expect, it } from 'vitest';
import {
  createAgentWorkflow,
  createDefaultAgentWorkflow,
  getAgentPublishReadiness,
} from '@/common/types/agent/agentWorkflow';

describe('Agent workflow contract', () => {
  it('creates the extensible single-agent execution path', () => {
    const workflow = createDefaultAgentWorkflow();

    expect(workflow.nodes.map((node) => node.kind)).toEqual(['start', 'agent', 'output']);
    expect(workflow.edges).toHaveLength(2);
    expect(workflow.trigger).toBe('manual');
  });

  it('normalizes optional input guidance while preserving output format', () => {
    const workflow = createAgentWorkflow('   ', 'json');

    expect(workflow.input.placeholder).toBeUndefined();
    expect(workflow.output.format).toBe('json');
  });

  it('blocks publication when required builder content is blank', () => {
    const readiness = getAgentPublishReadiness({ name: ' ', instructions: '', inputPlaceholder: '\n' });

    expect(readiness.every((item) => !item.ready)).toBe(true);
  });
});
