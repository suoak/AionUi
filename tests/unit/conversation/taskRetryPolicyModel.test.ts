import { describe, expect, it } from 'vitest';
import {
  buildRetryPolicy,
  clampAttempts,
  retryPolicySupported,
  runAttemptLabel,
  timeoutMinutesToMs,
  timeoutMsToMinutes,
} from '@/renderer/pages/conversation/components/taskRetryPolicyModel';
import type { TaskSession } from '@/common/types/agent/taskSession';

const task = (extra: Partial<TaskSession> = {}): TaskSession =>
  ({
    id: 't',
    title: 't',
    mode: 'plan',
    objective: '',
    acceptance_criteria: [],
    status: 'ready',
    agent_type: 'acp',
    created_at: 0,
    updated_at: 0,
    ...extra,
  }) as TaskSession;

describe('taskRetryPolicyModel', () => {
  it('hides the policy on cores that do not report it', () => {
    expect(retryPolicySupported(undefined)).toBe(false);
    expect(retryPolicySupported(task())).toBe(false);
    expect(retryPolicySupported(task({ retry_max_attempts: 1 }))).toBe(true);
  });

  it('defaults to a single attempt and caps retries at three attempts', () => {
    expect(buildRetryPolicy(false, 3, undefined)).toEqual({ max_attempts: 1, timeout_ms: null });
    expect(buildRetryPolicy(true, 1, undefined).max_attempts).toBe(2);
    expect(buildRetryPolicy(true, 9, undefined).max_attempts).toBe(3);
    expect(clampAttempts(Number.NaN)).toBe(1);
  });

  it('converts the timeout within the core bounds', () => {
    expect(timeoutMinutesToMs(undefined)).toBeNull();
    expect(timeoutMinutesToMs(0)).toBeNull();
    expect(timeoutMinutesToMs(10)).toBe(600_000);
    expect(timeoutMinutesToMs(100_000)).toBe(86_400_000);
    expect(timeoutMsToMinutes(600_000)).toBe(10);
    expect(timeoutMsToMinutes(null)).toBeUndefined();
  });

  it('labels retry attempts in the run picker only', () => {
    expect(runAttemptLabel({})).toBe('');
    expect(runAttemptLabel({ attempt: 1 })).toBe('');
    expect(runAttemptLabel({ attempt: 2, retry_of_run_id: 'r1' })).toBe(' · #2 ↻');
  });
});
