import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listRuns: vi.fn(),
  getReview: vi.fn(),
  getRetainedOutput: vi.fn(),
  listDeliveries: vi.fn(),
  openExternalUrl: vi.fn(),
  replay: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    taskSession: {
      run: { list: { invoke: mocks.listRuns }, review: { invoke: mocks.getReview }, replay: { invoke: mocks.replay } },
    },
    conversation: { getRetainedOutput: { invoke: mocks.getRetainedOutput } },
    scmDelivery: { list: { invoke: mocks.listDeliveries } },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({ openExternalUrl: mocks.openExternalUrl }));

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

// The annotatable diff itself is covered by its own DOM test; here it is a stub
// that exposes the scope the panel hands it (the model helpers stay real).
vi.mock('@/renderer/pages/conversation/Preview/components/annotate', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AnnotatableDiff: ({ patch, scope }: { patch: string; scope: unknown }) => (
    <pre data-annotatable-stub={JSON.stringify(scope)}>{patch}</pre>
  ),
}));

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
    mocks.getRetainedOutput.mockResolvedValue({
      content: '--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -1,1 +1,2 @@\n const a = 1;\n+const b = 2;\n',
    });

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
    // The retained diff is annotatable in the task_run scope, keyed by the
    // patch's own repo-relative path.
    const stub = document.querySelector('[data-annotatable-stub]') as HTMLElement;
    expect(JSON.parse(stub.dataset.annotatableStub ?? '{}')).toEqual({
      scope_kind: 'task_run',
      scope_id: 'run-1',
      file_path: 'src/auth.ts',
      run_id: 'run-1',
      task_session_id: 'task-1',
      conversation_id: 'conversation-1',
    });
  });

  it('lists pull requests recorded as run evidence (M7 E4-5)', async () => {
    mocks.listDeliveries.mockResolvedValue([]);
    mocks.listRuns.mockResolvedValue([
      { id: 'run-2', run_kind: 'execution', status: 'completed', started_at: 1, task_session_id: 'task-2' },
    ]);
    mocks.getReview.mockResolvedValue({
      task: { id: 'task-2', mode: 'goal', status: 'completed' },
      run: { id: 'run-2', run_kind: 'execution', status: 'completed', started_at: 1, finished_at: 5 },
      artifacts: [],
      approvals: [],
      acceptance_criteria: [],
      trace: [],
      checkpoints: [],
      evidence: [
        {
          id: 'pr-1',
          kind: 'artifact',
          summary: 'Pull request: Add login',
          reference: 'https://github.com/o/r/pull/12',
          metadata: {
            type: 'pull_request',
            url: 'https://github.com/o/r/pull/12',
            number: '12',
            provider: 'github',
            branch: 'feat/login',
            base: 'main',
            draft: true,
          },
          created_at: 1,
        },
      ],
      summary: {
        status: 'completed',
        files_changed: 0,
        tool_calls: 0,
        policy_decisions: 0,
        denied_decisions: 0,
        criteria_passed: 0,
        criteria_total: 0,
      },
    });

    render(<TaskReviewPanel visible taskId='task-2' conversationId='conversation-2' onCancel={vi.fn()} />);

    expect(await screen.findByText('Add login')).toBeTruthy();
    expect(screen.getByText('conversation.explorer.scm.delivery.draftTag')).toBeTruthy();
    fireEvent.click(screen.getByText('#12 · https://github.com/o/r/pull/12'));
    expect(mocks.openExternalUrl).toHaveBeenCalledWith('https://github.com/o/r/pull/12');
    // A Core with the delivery API offers the task-linked dialog; with no
    // project repository loaded it explains why it is unavailable.
    expect(await screen.findByText('conversation.explorer.scm.delivery.open')).toBeTruthy();
    expect(screen.getByText('conversation.explorer.scm.delivery.noRepository')).toBeTruthy();
  });

  it('shows the replay tab with cursor paging and retention gaps (M7 E5-6)', async () => {
    mocks.listDeliveries.mockResolvedValue([]);
    mocks.listRuns.mockResolvedValue([
      { id: 'run-3', run_kind: 'execution', status: 'failed', started_at: 1, task_session_id: 'task-3' },
    ]);
    mocks.getReview.mockResolvedValue({
      task: { id: 'task-3', mode: 'goal', status: 'failed' },
      run: { id: 'run-3', run_kind: 'execution', status: 'failed', started_at: 1 },
      artifacts: [],
      approvals: [],
      acceptance_criteria: [],
      trace: [],
      checkpoints: [],
      evidence: [],
      summary: {
        status: 'failed',
        files_changed: 0,
        tool_calls: 0,
        policy_decisions: 0,
        denied_decisions: 0,
        criteria_passed: 0,
        criteria_total: 0,
      },
    });
    const event = (sequence: number, event_type: string) => ({
      event_id: `e${sequence}`,
      task_id: 'task-3',
      run_id: 'run-3',
      sequence,
      timestamp: 1000 * sequence,
      event_type,
      payload: { n: sequence },
    });
    mocks.replay
      .mockResolvedValueOnce({
        run: { id: 'run-3' },
        events: [event(3, 'tool.requested')],
        next_after_sequence: 3,
        has_more: true,
        latest_sequence: 4,
        retention_gap: true,
      })
      .mockResolvedValueOnce({
        run: { id: 'run-3' },
        events: [event(4, 'tool.failed')],
        next_after_sequence: 4,
        has_more: false,
        latest_sequence: 4,
        retention_gap: false,
      });

    render(<TaskReviewPanel visible taskId='task-3' conversationId='conversation-3' onCancel={vi.fn()} />);

    expect(await screen.findByText('conversation.taskSession.replay.tab')).toBeTruthy();
    expect(mocks.replay).toHaveBeenCalledWith({ id: 'task-3', run_id: 'run-3', after_sequence: 0, limit: 200 });
    expect(screen.getByText('conversation.taskSession.replay.retentionGap')).toBeTruthy();
    // Sequences 1-2 were pruned before the first retained event.
    expect(screen.getByText('conversation.taskSession.replay.removed')).toBeTruthy();

    fireEvent.click(screen.getByText('conversation.taskSession.replay.loadMore'));
    expect(await screen.findByText('tool.failed')).toBeTruthy();
    expect(mocks.replay).toHaveBeenLastCalledWith({ id: 'task-3', run_id: 'run-3', after_sequence: 3, limit: 200 });
    expect(screen.queryByText('conversation.taskSession.replay.loadMore')).toBeNull();
    fireEvent.click(screen.getByText('conversation.taskSession.replay.jumpToError'));
    expect(screen.getByText('"n": 4', { exact: false })).toBeTruthy();
  });

  it('hides the replay tab when the core has no replay endpoint', async () => {
    mocks.listDeliveries.mockResolvedValue([]);
    mocks.listRuns.mockResolvedValue([
      { id: 'run-4', run_kind: 'execution', status: 'completed', started_at: 1, task_session_id: 'task-4' },
    ]);
    mocks.getReview.mockResolvedValue({
      task: { id: 'task-4', mode: 'goal', status: 'completed' },
      run: { id: 'run-4', run_kind: 'execution', status: 'completed', started_at: 1 },
      artifacts: [],
      approvals: [],
      acceptance_criteria: [],
      trace: [],
      checkpoints: [],
      evidence: [],
      summary: {
        status: 'completed',
        files_changed: 0,
        tool_calls: 0,
        policy_decisions: 0,
        denied_decisions: 0,
        criteria_passed: 0,
        criteria_total: 0,
      },
    });
    mocks.replay.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));

    render(<TaskReviewPanel visible taskId='task-4' conversationId='conversation-4' onCancel={vi.fn()} />);

    expect(await screen.findByText('conversation.taskSession.review.overview')).toBeTruthy();
    await waitFor(() => expect(mocks.replay).toHaveBeenCalled());
    expect(screen.queryByText('conversation.taskSession.replay.tab')).toBeNull();
  });
});
