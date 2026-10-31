jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));
jest.mock('@/src/services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('@/src/components/chat/MarkdownContent', () => {
  const { Text } = jest.requireActual('react-native');
  return { MarkdownContent: ({ content }: { content: string }) => <Text>{content}</Text> };
});

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { api } from '@/src/services/api';
import { TaskApprovalCard } from '@/src/components/inbox/TaskApprovalCard';

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const ok = (data: unknown) => ({ data: { success: true, data } });

const approval = {
  id: 'ap1',
  task_session_id: 'ts1',
  approval_type: 'plan',
  artifact_id: 'ar1',
  artifact_hash: 'h1',
  status: 'pending',
  requested_at: 1,
};
const artifact = {
  id: 'ar1',
  task_session_id: 'ts1',
  kind: 'plan',
  version: 2,
  content: '# The plan',
  content_hash: 'h1',
  status: 'pending_approval',
  created_at: 1,
  updated_at: 1,
};

beforeEach(() => {
  get
    .mockReset()
    .mockImplementation(async (url: string) => (url.endsWith('/approvals') ? ok([approval]) : ok([artifact])));
  post.mockReset();
});

describe('TaskApprovalCard', () => {
  it('shows the plan and approves it without executing (desktop prompt)', async () => {
    post.mockResolvedValue(ok({ ...approval, status: 'approved' }));
    const screen = render(<TaskApprovalCard taskSessionId='ts1' approvalId='ap1' />);
    await waitFor(() => expect(screen.getByText('# The plan')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('task-approval-comment'), 'looks good');
    fireEvent.press(screen.getByTestId('task-approval-approve'));
    await waitFor(() => expect(screen.getByTestId('plan-execute-on-desktop')).toBeTruthy());
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/task-sessions/ts1/approvals/ap1/decision', {
      decision: 'approve',
      artifact_id: 'ar1',
      artifact_hash: 'h1',
      comment: 'looks good',
    });
    expect(screen.queryByTestId('task-approval-approve')).toBeNull();
  });

  it('shows a conflict message on 409', async () => {
    post.mockRejectedValue({ response: { status: 409, data: { code: 'CONFLICT' } } });
    const screen = render(<TaskApprovalCard taskSessionId='ts1' approvalId='ap1' />);
    await waitFor(() => expect(screen.getByTestId('task-approval-reject')).toBeTruthy());
    fireEvent.press(screen.getByTestId('task-approval-reject'));
    await waitFor(() => expect(screen.getByText('approval.taskConflict')).toBeTruthy());
  });

  it('reports a missing approval', async () => {
    const screen = render(<TaskApprovalCard taskSessionId='ts1' approvalId='other' />);
    await waitFor(() => expect(screen.getByText('approval.taskMissing')).toBeTruthy());
  });
});
