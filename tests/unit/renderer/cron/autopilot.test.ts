/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { IChannelSession, IChannelUser } from '@/common/types/channel/channel';
import {
  AUTOPILOT_OFF,
  autopilotChannelOptions,
  autopilotCreateFields,
  autopilotStateFromJob,
  autopilotUpdateFields,
  canUseFullAuto,
  getAutopilotErrorMessage,
  isAutopilotBlockedMode,
} from '@/renderer/pages/cron/ScheduledTasksPage/autopilot';

const t = ((key: string) => key) as never;

const httpError = (status: number, error: string, code = status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST') =>
  new BackendHttpError({ method: 'PUT', path: '/api/cron/jobs/job-1', status, body: { error, code } });

const job = (state: Partial<ICronJob['state']> = {}, createdBy: 'user' | 'agent' = 'user'): ICronJob =>
  ({
    id: 'job-1',
    metadata: { created_by: createdBy },
    state: { next_run_at_ms: 1, run_count: 0, retry_count: 0, max_retries: 0, queue_enabled: false, ...state },
  }) as unknown as ICronJob;

describe('autopilot helpers', () => {
  it('blocks plan and goal modes, case-insensitively', () => {
    expect(isAutopilotBlockedMode('plan')).toBe(true);
    expect(isAutopilotBlockedMode(' Goal ')).toBe(true);
    expect(isAutopilotBlockedMode('yolo')).toBe(false);
    expect(isAutopilotBlockedMode('default')).toBe(false);
    expect(isAutopilotBlockedMode(undefined)).toBe(false);
  });

  it('reads state from a job, treating older cores as off', () => {
    expect(autopilotStateFromJob(undefined)).toEqual(AUTOPILOT_OFF);
    expect(autopilotStateFromJob(job())).toEqual(AUTOPILOT_OFF);
    expect(autopilotStateFromJob(job({ autopilot: true, autopilot_yolo: true, notify_channel_id: 's1' }))).toEqual({
      enabled: true,
      yolo: true,
      channelId: 's1',
    });
  });

  it('never offers full-auto on agent-created jobs', () => {
    expect(canUseFullAuto(undefined)).toBe(true);
    expect(canUseFullAuto(job())).toBe(true);
    expect(canUseFullAuto(job({}, 'agent'))).toBe(false);
  });

  it('omits every Autopilot field on create while it is off', () => {
    expect(autopilotCreateFields(AUTOPILOT_OFF)).toEqual({});
    expect(autopilotCreateFields({ enabled: true, yolo: false })).toEqual({ autopilot: true, autopilot_yolo: false });
    expect(autopilotCreateFields({ enabled: true, yolo: true, channelId: 's1' })).toEqual({
      autopilot: true,
      autopilot_yolo: true,
      notify_channel_id: 's1',
    });
  });

  it('sends only changed fields on update and clears the channel with an empty string', () => {
    const on = job({ autopilot: true, autopilot_yolo: false, notify_channel_id: 's1' });
    expect(autopilotUpdateFields({ enabled: true, yolo: false, channelId: 's1' }, on)).toEqual({});
    expect(autopilotUpdateFields({ enabled: true, yolo: true, channelId: 's1' }, on)).toEqual({ autopilot_yolo: true });
    expect(autopilotUpdateFields({ enabled: true, yolo: false }, on)).toEqual({ notify_channel_id: '' });
    expect(autopilotUpdateFields({ enabled: false, yolo: false, channelId: 's1' }, on)).toEqual({ autopilot: false });
    const yolo = job({ autopilot: true, autopilot_yolo: true });
    expect(autopilotUpdateFields({ enabled: false, yolo: false }, yolo)).toEqual({
      autopilot: false,
      autopilot_yolo: false,
    });
    expect(autopilotUpdateFields(AUTOPILOT_OFF, job())).toEqual({});
  });

  it('lists only sessions that can receive messages, newest first', () => {
    const sessions = [
      { id: 's-old', user_id: 'u1', agent_type: 'acp', chatId: 'chat-1', created_at: 1, lastActivity: 1 },
      { id: 's-new', user_id: 'u2', agent_type: 'acp', chatId: 'chat-2', created_at: 1, lastActivity: 9 },
      { id: 's-nochat', user_id: 'u1', agent_type: 'acp', created_at: 1, lastActivity: 20 },
      { id: 's-blank', user_id: 'u1', agent_type: 'acp', chatId: '  ', created_at: 1, lastActivity: 30 },
    ] as unknown as IChannelSession[];
    const users = [
      { id: 'u1', platformUserId: 'tg-1', platformType: 'telegram', display_name: 'Lian', authorizedAt: 1 },
      { id: 'u2', platformUserId: 'lark-2', platformType: 'lark', authorizedAt: 1 },
    ] as IChannelUser[];
    expect(autopilotChannelOptions(sessions, users)).toEqual([
      { value: 's-new', label: 'Lark · lark-2' },
      { value: 's-old', label: 'Telegram · Lian' },
    ]);
  });

  it('maps Core Autopilot errors to localised messages', () => {
    expect(getAutopilotErrorMessage(httpError(403, 'Forbidden.'), t, true)).toBe('cron.autopilot.error.forbidden');
    expect(getAutopilotErrorMessage(httpError(403, 'Forbidden.'), t, false)).toBeUndefined();
    expect(getAutopilotErrorMessage(httpError(400, "notify channel 's9' not found"), t, true)).toBe(
      'cron.autopilot.error.invalidChannel'
    );
    expect(getAutopilotErrorMessage(httpError(400, "notify channel 's9' has no chat to deliver to"), t, true)).toBe(
      'cron.autopilot.error.invalidChannel'
    );
    expect(getAutopilotErrorMessage(httpError(400, 'mode `plan` cannot be used with Autopilot'), t, true)).toBe(
      'cron.autopilot.error.modeBlocked'
    );
    expect(
      getAutopilotErrorMessage(
        httpError(400, 'Invalid agent config: autopilot_yolo requires autopilot to be enabled'),
        t,
        true
      )
    ).toBe('cron.autopilot.error.yoloNeedsAutopilot');
    expect(getAutopilotErrorMessage(httpError(400, 'Invalid cron expression'), t, true)).toBeUndefined();
    expect(getAutopilotErrorMessage(httpError(500, 'boom', 'INTERNAL'), t, true)).toBeUndefined();
    expect(getAutopilotErrorMessage(new Error('offline'), t, true)).toBeUndefined();
  });
});

describe('full-auto entry points', () => {
  // Agent-facing surfaces must never be able to turn on full-auto: the only
  // renderer code that writes `autopilot_yolo` is the user's task dialog.
  it('only the scheduled-task dialog writes autopilot_yolo', () => {
    const root = path.resolve(__dirname, '../../../../packages/desktop/src');
    const allowed = new Set([
      'common/adapter/ipcBridge.ts',
      'renderer/pages/cron/ScheduledTasksPage/autopilot.ts',
      'renderer/pages/cron/ScheduledTasksPage/AutopilotSection.tsx',
      'renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog.tsx',
      'renderer/pages/cron/ScheduledTasksPage/TaskDetailPage.tsx',
    ]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
          const rel = path.relative(root, full).split(path.sep).join('/');
          if (!allowed.has(rel) && fs.readFileSync(full, 'utf8').includes('autopilot_yolo')) offenders.push(rel);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
