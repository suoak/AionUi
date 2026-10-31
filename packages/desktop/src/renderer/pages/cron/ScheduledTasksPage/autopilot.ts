/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TFunction } from 'i18next';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { ICreateCronJobParams, ICronJob, ICronJobUpdateParams } from '@/common/adapter/ipcBridge';
import type { IChannelSession, IChannelUser } from '@/common/types/channel/channel';

/** Autopilot settings as edited in the scheduled-task dialog (E8-6). */
export type AutopilotFormState = {
  enabled: boolean;
  /** Full-auto. Only ever true after the user confirmed the risk dialog. */
  yolo: boolean;
  /** `/api/channel/sessions` id; `undefined` = Inbox only, no IM summary. */
  channelId?: string;
};

export const AUTOPILOT_OFF: AutopilotFormState = { enabled: false, yolo: false, channelId: undefined };

export function autopilotStateFromJob(job?: ICronJob): AutopilotFormState {
  if (!job?.state.autopilot) {
    return { ...AUTOPILOT_OFF, channelId: job?.state.notify_channel_id || undefined };
  }
  return {
    enabled: true,
    yolo: Boolean(job.state.autopilot_yolo),
    channelId: job.state.notify_channel_id || undefined,
  };
}

/** Modes that need a human in the loop; Core rejects them for Autopilot (400). */
export function isAutopilotBlockedMode(mode?: string | null): boolean {
  const value = mode?.trim().toLowerCase();
  return value === 'plan' || value === 'goal';
}

/** Core refuses full-auto on agent-created jobs (403), so the UI never offers it there. */
export function canUseFullAuto(job?: ICronJob): boolean {
  return job?.metadata.created_by !== 'agent';
}

/** Autopilot fields for `POST /api/cron/jobs`. Omitted entirely while off (Core defaults to off). */
export function autopilotCreateFields(
  state: AutopilotFormState
): Pick<ICreateCronJobParams, 'autopilot' | 'autopilot_yolo' | 'notify_channel_id'> {
  if (!state.enabled) return {};
  return {
    autopilot: true,
    autopilot_yolo: state.yolo,
    ...(state.channelId ? { notify_channel_id: state.channelId } : {}),
  };
}

/**
 * Autopilot fields for `PUT /api/cron/jobs/:id`. Only fields that changed are
 * sent, so editing an unrelated field never re-confirms full-auto; an empty
 * `notify_channel_id` clears the channel.
 */
export function autopilotUpdateFields(
  state: AutopilotFormState,
  original: ICronJob
): Pick<NonNullable<ICronJobUpdateParams['state']>, 'autopilot' | 'autopilot_yolo' | 'notify_channel_id'> {
  const before = autopilotStateFromJob(original);
  const yolo = state.enabled && state.yolo;
  const fields: Pick<
    NonNullable<ICronJobUpdateParams['state']>,
    'autopilot' | 'autopilot_yolo' | 'notify_channel_id'
  > = {};
  if (state.enabled !== before.enabled) fields.autopilot = state.enabled;
  if (yolo !== (before.enabled && before.yolo)) fields.autopilot_yolo = yolo;
  if ((state.channelId ?? '') !== (before.channelId ?? '')) fields.notify_channel_id = state.channelId ?? '';
  return fields;
}

export type AutopilotChannelOption = { value: string; label: string };

/**
 * IM channels the summary can go to. `/api/channel/sessions` is scoped to the
 * signed-in user, so these are only the user's own sessions; a session with
 * no chat cannot receive messages and is left out.
 */
export function autopilotChannelOptions(sessions: IChannelSession[], users: IChannelUser[]): AutopilotChannelOption[] {
  const byId = new Map(users.map((user) => [user.id, user]));
  return sessions
    .filter((session) => Boolean(session.chatId?.trim()))
    .slice()
    .sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0))
    .map((session) => {
      const user = byId.get(session.user_id);
      const platform = user?.platformType ?? session.agent_type;
      const who = user?.display_name || user?.platformUserId || session.chatId || session.id;
      return { value: session.id, label: `${formatPlatform(platform)} · ${who}` };
    });
}

function formatPlatform(platform?: string): string {
  if (!platform) return '';
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

/**
 * Localised message for Core's Autopilot validation errors (400 / 403).
 * Returns `undefined` for anything else so the caller's generic handling runs.
 */
export function getAutopilotErrorMessage(error: unknown, t: TFunction, touchesAutopilot: boolean): string | undefined {
  if (!isBackendHttpError(error)) return undefined;
  const message = error.backendMessage || '';
  if (error.status === 403 && touchesAutopilot) {
    return t('cron.autopilot.error.forbidden');
  }
  if (error.status !== 400) return undefined;
  if (/notify channel/i.test(message)) return t('cron.autopilot.error.invalidChannel');
  if (/cannot be used with Autopilot/i.test(message)) return t('cron.autopilot.error.modeBlocked');
  if (/autopilot_yolo requires autopilot/i.test(message)) return t('cron.autopilot.error.yoloNeedsAutopilot');
  return undefined;
}
