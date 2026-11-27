/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import { cronRunAsFields, isAbsoluteRepoPath, runAsFromJob } from '@/renderer/pages/cron/ScheduledTasksPage/cronRunAs';

describe('cron run as task (3.0 U6)', () => {
  it('treats jobs from before 3.0 as conversation jobs', () => {
    expect(runAsFromJob({ target: { payload: { kind: 'message', text: 'x' } } } as ICronJob)).toBe('conversation');
    expect(runAsFromJob({ target: { payload: { kind: 'message', text: 'x' }, run_as: 'task' } } as ICronJob)).toBe(
      'task'
    );
    expect(runAsFromJob(null)).toBe('conversation');
  });

  it('accepts absolute POSIX, Windows and UNC paths only', () => {
    expect(isAbsoluteRepoPath('/work/repo')).toBe(true);
    expect(isAbsoluteRepoPath('C:\\\\work\\\\repo')).toBe(true);
    expect(isAbsoluteRepoPath('\\\\\\\\server\\\\share')).toBe(true);
    expect(isAbsoluteRepoPath('repo')).toBe(false);
  });

  it('sends run_as only when it matters', () => {
    expect(cronRunAsFields('conversation', { start: false, repoPath: '' }, null)).toEqual({});
    expect(cronRunAsFields('conversation', { start: false, repoPath: '' }, 'conversation')).toEqual({});
    expect(cronRunAsFields('conversation', { start: false, repoPath: '' }, 'task')).toEqual({ run_as: 'conversation' });
    expect(cronRunAsFields('task', { start: true, repoPath: '  /r  ' }, null)).toEqual({
      run_as: 'task',
      task: { start: true, repo_path: '/r' },
    });
    expect(cronRunAsFields('task', { start: false, repoPath: ' ' }, 'task')).toEqual({
      run_as: 'task',
      task: { start: false },
    });
  });
});
