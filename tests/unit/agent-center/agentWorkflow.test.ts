import { describe, expect, it } from 'vitest';
import {
  createAgentWorkflow,
  createDefaultAgentWorkflow,
  createDefaultWorkflowNodes,
  getAgentPublishReadiness,
  getWorkflowNodeIssues,
  insertWorkflowNode,
  moveWorkflowNode,
  removeWorkflowNode,
  updateWorkflowNode,
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
    const readiness = getAgentPublishReadiness({
      name: ' ',
      instructions: '',
      inputPlaceholder: '\n',
      nodes: createDefaultWorkflowNodes(),
    });

    expect(readiness.filter((item) => item.key !== 'nodes').every((item) => !item.ready)).toBe(true);
    expect(readiness.find((item) => item.key === 'nodes')?.ready).toBe(true);
  });

  it('inserts and reorders configurable nodes without moving fixed boundary nodes', () => {
    const withTool = insertWorkflowNode(createDefaultWorkflowNodes(), 'tool', 'tool-1');
    const withApproval = insertWorkflowNode(withTool, 'approval', 'approval-1');

    expect(moveWorkflowNode(withApproval, 'approval-1', -1).map((node) => node.id)).toEqual([
      'start',
      'agent',
      'approval-1',
      'tool-1',
      'output',
    ]);
    expect(moveWorkflowNode(withApproval, 'tool-1', -1)).toBe(withApproval);
  });

  it('reports incomplete configurable nodes and clears the issue after configuration', () => {
    const nodes = insertWorkflowNode(createDefaultWorkflowNodes(), 'condition', 'condition-1');
    const configured = updateWorkflowNode(nodes, 'condition-1', { config: { expression: 'risk_score > 70' } });

    expect(getWorkflowNodeIssues(nodes)).toEqual([{ nodeId: 'condition-1', field: 'expression' }]);
    expect(getWorkflowNodeIssues(configured)).toEqual([]);
  });

  it('rejects a tool node whose MCP server is no longer enabled', () => {
    const nodes = updateWorkflowNode(insertWorkflowNode(createDefaultWorkflowNodes(), 'tool', 'tool-1'), 'tool-1', {
      config: { mcp_server_id: 'github', tool_name: 'create_issue' },
    });

    expect(getWorkflowNodeIssues(nodes, ['filesystem'])).toEqual([{ nodeId: 'tool-1', field: 'mcpServerId' }]);
  });

  it('requires a concrete tool name and JSON object arguments', () => {
    const nodes = updateWorkflowNode(insertWorkflowNode(createDefaultWorkflowNodes(), 'tool', 'tool-1'), 'tool-1', {
      config: { mcp_server_id: 'github', arguments_json: '[]' },
    });

    expect(getWorkflowNodeIssues(nodes)).toEqual([
      { nodeId: 'tool-1', field: 'toolName' },
      { nodeId: 'tool-1', field: 'toolArguments' },
    ]);
  });

  it('removes configurable nodes but preserves required nodes', () => {
    const nodes = insertWorkflowNode(createDefaultWorkflowNodes(), 'tool', 'tool-1');

    expect(removeWorkflowNode(nodes, 'tool-1').map((node) => node.id)).toEqual(['start', 'agent', 'output']);
    expect(removeWorkflowNode(nodes, 'agent')).toEqual(nodes);
  });
});
