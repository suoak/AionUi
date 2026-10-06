import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listRuns: vi.fn(),
  getReview: vi.fn(),
  getRetainedOutput: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    taskSession: { run: { list: { invoke: mocks.listRuns }, review: { invoke: mocks.getReview } } },
    conversation: { getRetainedOutput: { invoke: mocks.getRetainedOutput } },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@arco-design/web-react', () => {
  const Tabs = Object.assign(({ children }: { children?: React.ReactNode }) => <div>{children}</div>, {
    TabPane: ({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) => (
      <section>
        <h2>{title}</h2>
        {children}
      </section>
    ),
  });
  const Typography = {
    Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    Paragraph: ({ children }: { children?: React.ReactNode }) => <pre>{children}</pre>,
  };
  return {
    Alert: ({ content }: { content: React.ReactNode }) => <div>{content}</div>,
    Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
      <button onClick={onClick}>{children}</button>
    ),
    Descriptions: ({ data }: { data: Array<{ label: React.ReactNode; value: React.ReactNode }> }) => (
      <dl>
        {data.map((item, index) => (
          <React.Fragment key={index}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </React.Fragment>
        ))}
      </dl>
    ),
    Empty: ({ description }: { description: React.ReactNode }) => <div>{description}</div>,
    List: Object.assign(
      ({
        dataSource = [],
        render: renderItem,
      }: {
        dataSource?: unknown[];
        render: (item: never) => React.ReactNode;
      }) => <div>{dataSource.map((item) => renderItem(item as never))}</div>,
      {
        Item: ({ children, actions }: { children?: React.ReactNode; actions?: React.ReactNode[] }) => (
          <div>
            {children}
            {actions}
          </div>
        ),
      }
    ),
    Message: { error: vi.fn() },
    Modal: ({ visible, children }: { visible: boolean; children?: React.ReactNode }) =>
      visible ? <div>{children}</div> : null,
    Select: Object.assign(({ children }: { children?: React.ReactNode }) => <div>{children}</div>, {
      Option: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    }),
    Space: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Spin: () => <div>loading</div>,
    Tabs,
    Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    Typography,
  };
});

import TaskReviewPanel from '@/renderer/pages/conversation/components/TaskReviewPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TaskReviewPanel', () => {
  it('renders authoritative review sections and retrieves retained diff evidence', async () => {
    mocks.listRuns.mockResolvedValue([
      {
        id: 'run-1',
        run_kind: 'execution',
        status: 'completed',
        started_at: 1,
        task_session_id: 'task-1',
        conversation_id: 'conversation-1',
      },
    ]);
    mocks.getReview.mockResolvedValue({
      task: { id: 'task-1', mode: 'goal', status: 'completed' },
      run: { id: 'run-1', run_kind: 'execution', status: 'completed', started_at: 1, finished_at: 5 },
      artifacts: [],
      approvals: [
        { id: 'approval-1', approval_type: 'plan', status: 'approved', artifact_hash: 'sha256-plan', requested_at: 1 },
      ],
      acceptance_criteria: [{ id: 'criterion-1', status: 'passed', description: 'Tests pass' }],
      trace: [
        {
          event_id: 'event-1',
          sequence: 1,
          event_type: 'tool.allowed',
          payload: { decision: 'allow', tool: 'Edit', capability: 'filesystem.write', reason: 'approved plan' },
        },
      ],
      checkpoints: [],
      evidence: [
        {
          id: 'file-1',
          trace_event_id: 'event-file',
          kind: 'file',
          metadata: { path: 'src/auth.ts', change_type: 'modified', added_lines: 2, deleted_lines: 1 },
        },
        { id: 'diff-1', trace_event_id: 'event-file', kind: 'diff', reference: 'output-ref', metadata: {} },
        { id: 'test-1', criterion_id: 'criterion-1', kind: 'command', summary: 'cargo test passed', metadata: {} },
      ],
      summary: {
        status: 'completed',
        files_changed: 1,
        tool_calls: 1,
        policy_decisions: 1,
        denied_decisions: 0,
        criteria_passed: 1,
        criteria_total: 1,
      },
    });
    mocks.getRetainedOutput.mockResolvedValue({ content: '--- a/src/auth.ts\n+++ b/src/auth.ts' });

    render(<TaskReviewPanel visible taskId='task-1' conversationId='conversation-1' onCancel={vi.fn()} />);

    await screen.findByText('src/auth.ts');
    expect(screen.getByText('conversation.taskSession.review.overview')).toBeTruthy();
    expect(screen.getByText('ALLOW')).toBeTruthy();
    expect(screen.getByText('sha256-plan')).toBeTruthy();
    expect(screen.getByText('cargo test passed', { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByText('conversation.taskSession.review.viewDiff'));
    await waitFor(() =>
      expect(mocks.getRetainedOutput).toHaveBeenCalledWith({
        conversation_id: 'conversation-1',
        reference: 'output-ref',
      })
    );
    expect(await screen.findByText('--- a/src/auth.ts', { exact: false })).toBeTruthy();
  });
});
