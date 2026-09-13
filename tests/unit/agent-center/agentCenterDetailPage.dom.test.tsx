import { Modal } from '@arco-design/web-react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentCenterDetail,
  AgentWorkflowDefinition,
  AgentWorkflowRun,
} from '@/common/types/agent/agentCenterTypes';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  listRuns: vi.fn(),
  retryRun: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    agentCenter: {
      get: { invoke: mocks.get },
      listWorkflowRuns: { invoke: mocks.listRuns },
      retryWorkflowRun: { invoke: mocks.retryRun },
    },
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ id: 'assistant-1' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, number>) => {
      if (key === 'common.retry') return 'Retry';
      if (key === 'common.cancel') return 'Cancel';
      if (key.endsWith('retryConfirmTitle')) return 'Run this tool again?';
      if (key.endsWith('agentRetryConfirmTitle')) return 'Retry this agent step?';
      if (key.endsWith('agentRetryConfirmDescription')) {
        return `Use frozen snapshot for attempt ${values?.attempt}; maximum ${values?.max}.`;
      }
      if (key.endsWith('retryConfirmDescription')) {
        return `Verify attempt ${values?.attempt}; maximum ${values?.max}.`;
      }
      return key;
    },
    i18n: { language: 'en-US' },
  }),
}));

import AgentCenterDetailPage from '@/renderer/pages/agent-center/AgentCenterDetailPage';

const workflow: AgentWorkflowDefinition = {
  schema_version: 1,
  trigger: 'manual',
  input: { kind: 'text', required: true },
  output: { format: 'markdown' },
  nodes: [
    { id: 'start', kind: 'start' },
    { id: 'agent', kind: 'agent' },
    { id: 'tool-1', kind: 'tool', config: { mcp_server_id: 'github', tool_name: 'create_issue' } },
    { id: 'output', kind: 'output' },
  ],
  edges: [
    { source: 'start', target: 'agent' },
    { source: 'agent', target: 'tool-1' },
    { source: 'tool-1', target: 'output' },
  ],
};

const detail = {
  assistant: {
    profile: { name: 'Issue creator', description: 'Creates an issue' },
    rules: { content: 'Create exactly one issue.' },
    prompts: { recommended: [] },
    defaults: { model: { mode: 'auto' } },
  },
  meta: {
    visibility: 'private',
    status: 'draft',
    version: 0,
    skill_refs: [],
    mcp_policy: 'allowlist',
    workflow,
  },
} as unknown as AgentCenterDetail;

const failedRun: AgentWorkflowRun = {
  id: 'awrun-1',
  assistant_id: 'assistant-1',
  revision: 0,
  preview_mode: 'draft',
  status: 'failed',
  current_node_index: 2,
  workflow,
  nodes: [
    { node_id: 'start', kind: 'start', status: 'completed' },
    { node_id: 'agent', kind: 'agent', status: 'completed', output: { content: 'ready' } },
    {
      node_id: 'tool-1',
      kind: 'tool',
      status: 'failed',
      attempt: 1,
      execution_id: 'awexec-1',
      error: 'remote tool failed',
    },
    { node_id: 'output', kind: 'output', status: 'pending' },
  ],
  variables: {},
  created_at: 1,
  updated_at: 2,
};

type ConfirmConfig = Parameters<typeof Modal.confirm>[0];

const renderDetail = async () => {
  render(<AgentCenterDetailPage />);
  await screen.findByText('awrun-1');
};

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue(detail);
  mocks.listRuns.mockReset().mockResolvedValue([failedRun]);
  mocks.retryRun.mockReset().mockResolvedValue(failedRun);
  mocks.navigate.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AgentCenterDetailPage tool retry safety', () => {
  it('requires confirmation before retrying a tool with possible side effects', async () => {
    const confirm = vi
      .spyOn(Modal, 'confirm')
      .mockImplementation(() => ({ close: () => {}, update: () => {} }) as unknown as ReturnType<typeof Modal.confirm>);
    await renderDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(mocks.retryRun).not.toHaveBeenCalled();
    expect((confirm.mock.calls[0][0] as ConfirmConfig).content).toContain('Verify attempt 1');
  });

  it('starts exactly one new execution after confirmation', async () => {
    const confirm = vi
      .spyOn(Modal, 'confirm')
      .mockImplementation(() => ({ close: () => {}, update: () => {} }) as unknown as ReturnType<typeof Modal.confirm>);
    await renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await (confirm.mock.calls[0][0] as ConfirmConfig).onOk?.();

    await waitFor(() => expect(mocks.retryRun).toHaveBeenCalledWith({ id: 'awrun-1' }));
    expect(mocks.retryRun).toHaveBeenCalledOnce();
  });

  it('keeps prior execution ids visible for side-effect auditing', async () => {
    const nodes = [...failedRun.nodes];
    nodes[2] = {
      ...nodes[2],
      attempt: 2,
      execution_id: 'awexec-2',
      attempts: [
        {
          attempt: 1,
          execution_id: 'awexec-old',
          status: 'failed',
          error: 'request outcome unknown',
        },
      ],
    };
    const runWithHistory: AgentWorkflowRun = {
      ...failedRun,
      nodes,
    };
    mocks.listRuns.mockResolvedValue([runWithHistory]);

    await renderDetail();
    fireEvent.click(screen.getByText('common.technical_details'));

    expect(await screen.findByText('awexec-old')).toBeInTheDocument();
    expect(screen.getByText('request outcome unknown')).toBeInTheDocument();
  });

  it('opens the frozen conversation plan after confirming an agent retry', async () => {
    const agentRun: AgentWorkflowRun = {
      ...failedRun,
      current_node_index: 1,
      nodes: [
        failedRun.nodes[0],
        {
          node_id: 'agent',
          kind: 'agent',
          status: 'failed',
          attempt: 1,
          execution_id: 'awexec-agent-1',
          error: 'agent turn failed',
          agent_plan: {
            create_conversation: {
              assistant: { id: 'assistant-1', conversation_overrides: { model: 'frozen-model' } },
              extra: { agent_workflow_run_id: 'awrun-1' },
            },
            message: 'original frozen message',
          },
        },
        failedRun.nodes[2],
        failedRun.nodes[3],
      ],
    };
    mocks.listRuns.mockResolvedValue([agentRun]);
    const confirm = vi
      .spyOn(Modal, 'confirm')
      .mockImplementation(() => ({ close: () => {}, update: () => {} }) as unknown as ReturnType<typeof Modal.confirm>);
    await renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await (confirm.mock.calls[0][0] as ConfirmConfig).onOk?.();

    expect(mocks.navigate).toHaveBeenCalledWith(
      '/guid',
      expect.objectContaining({
        state: expect.objectContaining({
          agentWorkflowRetryRunId: 'awrun-1',
          prefillPrompt: 'original frozen message',
        }),
      })
    );
    expect(mocks.retryRun).not.toHaveBeenCalled();
  });
});
