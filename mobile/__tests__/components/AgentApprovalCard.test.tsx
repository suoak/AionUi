jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));
jest.mock('@/src/services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { api } from '@/src/services/api';
import { AgentApprovalCard } from '@/src/components/inbox/AgentApprovalCard';
import type { AgentApproval } from '@/src/services/inbox';

const post = api.post as jest.Mock;

function record(overrides: Partial<AgentApproval> = {}): AgentApproval {
  return {
    id: 'g1',
    conversation_id: 'c1',
    kind: 'mcp',
    method: 'POST',
    path: '/api/mcp',
    summary: '{"name":"server"}',
    summary_truncated: false,
    status: 'pending',
    created_at: 0,
    // Far in the future so the card never treats it as expired.
    expires_at: Date.now() + 60 * 60 * 1000,
    ...overrides,
  };
}

beforeEach(() => {
  post.mockReset();
});

describe('AgentApprovalCard', () => {
  it('offers approve and deny for a complete summary', () => {
    const screen = render(<AgentApprovalCard record={record()} />);
    expect(screen.getByTestId('agent-approval-approve')).toBeTruthy();
    expect(screen.getByTestId('agent-approval-deny')).toBeTruthy();
    expect(screen.queryByTestId('agent-approval-truncated')).toBeNull();
  });

  it('hides approve and points to the desktop when the summary is truncated', () => {
    const screen = render(<AgentApprovalCard record={record({ summary_truncated: true })} />);
    expect(screen.queryByTestId('agent-approval-approve')).toBeNull();
    expect(screen.getByTestId('agent-approval-deny')).toBeTruthy();
    expect(screen.getByText('approval.summaryTruncatedDesktop')).toBeTruthy();
  });

  it('denies a truncated request from the phone', async () => {
    post.mockResolvedValue({ data: { success: true, data: record({ summary_truncated: true, status: 'denied' }) } });
    const onResolved = jest.fn();
    const screen = render(<AgentApprovalCard record={record({ summary_truncated: true })} onResolved={onResolved} />);
    fireEvent.press(screen.getByTestId('agent-approval-deny'));
    await waitFor(() => expect(screen.getByText('approval.agentDenied')).toBeTruthy());
    expect(post).toHaveBeenCalledWith('/api/agent-approvals/g1/deny');
    expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied' }));
    expect(screen.queryByTestId('agent-approval-deny')).toBeNull();
  });

  it('shows "already handled" on APPROVAL_NOT_PENDING', async () => {
    post.mockRejectedValue({ response: { status: 409, data: { code: 'APPROVAL_NOT_PENDING' } } });
    const screen = render(<AgentApprovalCard record={record()} />);
    fireEvent.press(screen.getByTestId('agent-approval-approve'));
    await waitFor(() => expect(screen.getByText('approval.alreadyHandled')).toBeTruthy());
  });
});
