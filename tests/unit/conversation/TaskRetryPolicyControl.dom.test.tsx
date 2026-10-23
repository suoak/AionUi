import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), success: vi.fn(), error: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: { taskSession: { get: { invoke: mocks.get }, retryPolicy: { update: { invoke: mocks.update } } } },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  InputNumber: ({
    value,
    onChange,
    ...rest
  }: {
    value?: number;
    onChange?: (v?: number) => void;
    'aria-label'?: string;
  }) => (
    <input
      aria-label={rest['aria-label']}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value === '' ? undefined : Number(event.target.value))}
    />
  ),
  Message: { success: mocks.success, error: mocks.error },
  Space: ({ children, ...rest }: { children?: React.ReactNode; 'data-testid'?: string }) => (
    <div data-testid={rest['data-testid']}>{children}</div>
  ),
  Switch: ({
    checked,
    onChange,
    ...rest
  }: {
    checked?: boolean;
    onChange?: (v: boolean) => void;
    'aria-label'?: string;
  }) => (
    <input
      type='checkbox'
      aria-label={rest['aria-label']}
      checked={!!checked}
      onChange={(e) => onChange?.(e.target.checked)}
    />
  ),
  Typography: { Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span> },
}));

import TaskRetryPolicyControl from '@/renderer/pages/conversation/components/TaskRetryPolicyControl';

const baseTask = {
  id: 'task-1',
  title: 't',
  mode: 'plan',
  objective: '',
  acceptance_criteria: [],
  status: 'ready',
  agent_type: 'acp',
  created_at: 0,
  updated_at: 0,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TaskRetryPolicyControl', () => {
  it('renders nothing on cores without the retry policy', async () => {
    mocks.get.mockResolvedValue(baseTask);
    render(<TaskRetryPolicyControl taskId='task-1' visible />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(screen.queryByTestId('task-retry-policy')).toBeNull();
  });

  it('is off by default and saves an explicit retry policy with a timeout', async () => {
    mocks.get.mockResolvedValue({ ...baseTask, retry_max_attempts: 1 });
    mocks.update.mockResolvedValue({ ...baseTask, retry_max_attempts: 3, retry_timeout_ms: 900_000 });
    render(<TaskRetryPolicyControl taskId='task-2' visible />);
    const toggle = (await screen.findAllByLabelText('conversation.taskSession.retry.enable'))[0] as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.queryByLabelText('conversation.taskSession.retry.maxAttempts')).toBeNull();
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('conversation.taskSession.retry.maxAttempts'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('conversation.taskSession.retry.timeout'), { target: { value: '15' } });
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ id: 'task-2', max_attempts: 3, timeout_ms: 900_000 })
    );
    expect(mocks.success).toHaveBeenCalled();
  });

  it('reports a failed save', async () => {
    mocks.get.mockResolvedValue({ ...baseTask, retry_max_attempts: 2, retry_timeout_ms: 60_000 });
    mocks.update.mockRejectedValue(new Error('400'));
    render(<TaskRetryPolicyControl taskId='task-3' visible />);
    fireEvent.click(await screen.findByText('common.save'));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ id: 'task-3', max_attempts: 2, timeout_ms: 60_000 })
    );
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  });
});
