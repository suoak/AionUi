import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentWorkflowDefinitionFields from '@/renderer/pages/agent-center/AgentWorkflowDefinitionFields';
import { createDefaultWorkflowNodes } from '@/common/types/agent/agentWorkflow';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const baseProps = {
  inputPlaceholder: '',
  onInputPlaceholderChange: vi.fn(),
  outputFormat: 'json' as const,
  onOutputFormatChange: vi.fn(),
  outputSchema: [],
  onOutputSchemaChange: vi.fn(),
  nodes: createDefaultWorkflowNodes(),
  onNodesChange: vi.fn(),
  toolOptions: [],
};

describe('Agent workflow output schema editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a valid required string field from the empty state', () => {
    render(<AgentWorkflowDefinitionFields {...baseProps} />);

    fireEvent.click(screen.getByText('agent.agentCenter.workflow.outputSchema.addField'));

    expect(baseProps.onOutputSchemaChange).toHaveBeenCalledWith([
      { name: 'field_1', type: 'string', required: true },
    ]);
  });

  it('hides schema controls for non-JSON output formats', () => {
    render(<AgentWorkflowDefinitionFields {...baseProps} outputFormat='markdown' />);

    expect(screen.queryByText('agent.agentCenter.workflow.outputSchema.addField')).not.toBeInTheDocument();
  });
});
