/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CronRunAs, ICronJob, ICronTaskOptions } from '@/common/adapter/ipcBridge';

/** 3.0 U6: what a job does on each run; jobs from before 3.0 open a conversation. */
export const runAsFromJob = (job: Pick<ICronJob, 'target'> | null | undefined): CronRunAs =>
  job?.target.run_as === 'task' ? 'task' : 'conversation';

/** Absolute POSIX, Windows drive or UNC path. */
export const isAbsoluteRepoPath = (value: string): boolean =>
  value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');

export type CronTaskFormState = { start: boolean; repoPath: string };

/**
 * Pure: the `run_as` / `task` fields to send. Conversation jobs send nothing
 * unless an edit switches a task job back, so older cores see no new fields.
 */
export const cronRunAsFields = (
  runAs: CronRunAs,
  form: CronTaskFormState,
  previous: CronRunAs | null
): { run_as?: CronRunAs; task?: ICronTaskOptions } => {
  if (runAs === 'conversation') {
    return previous === 'task' ? { run_as: 'conversation' } : {};
  }
  const repo = form.repoPath.trim();
  return { run_as: 'task', task: { start: form.start, ...(repo ? { repo_path: repo } : {}) } };
};
