import {
  TASK_RETRY_MAX_ATTEMPTS,
  TASK_RUN_TIMEOUT_MAX_MS,
  TASK_RUN_TIMEOUT_MIN_MS,
  type TaskRetryPolicyInput,
  type TaskRun,
  type TaskSession,
} from '@/common/types/agent/taskSession';

/** Cores before M7 E5-5 do not report the policy: the controls stay hidden. */
export const retryPolicySupported = (task?: TaskSession): task is TaskSession & { retry_max_attempts: number } =>
  typeof task?.retry_max_attempts === 'number';

export const clampAttempts = (value: number): number =>
  Math.min(TASK_RETRY_MAX_ATTEMPTS, Math.max(1, Math.round(Number.isFinite(value) ? value : 1)));

/** Timeout is edited in whole minutes; `null` means no timeout. */
export const timeoutMinutesToMs = (minutes: number | null | undefined): number | null => {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return null;
  const ms = Math.round(minutes * 60_000);
  return Math.min(TASK_RUN_TIMEOUT_MAX_MS, Math.max(TASK_RUN_TIMEOUT_MIN_MS, ms));
};

export const timeoutMsToMinutes = (ms?: number | null): number | undefined =>
  typeof ms === 'number' && ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : undefined;

export const buildRetryPolicy = (
  retryEnabled: boolean,
  attempts: number,
  timeoutMinutes: number | null | undefined
): TaskRetryPolicyInput => ({
  max_attempts: retryEnabled ? Math.max(2, clampAttempts(attempts)) : 1,
  timeout_ms: timeoutMinutesToMs(timeoutMinutes),
});

/** Suffix for the run picker: `#2 ↻` marks a retry attempt; empty on old cores and first attempts. */
export const runAttemptLabel = (run: Pick<TaskRun, 'attempt' | 'retry_of_run_id'>): string =>
  typeof run.attempt === 'number' && (run.attempt > 1 || run.retry_of_run_id) ? ` · #${run.attempt} ↻` : '';
