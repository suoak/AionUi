/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TaskBoardItem, TaskDeliveryInfo } from '@/common/types/agent/taskSession';
import type { FanoutGroup } from '@/common/types/fanout';

export const TASK_DETAIL_TABS = ['overview', 'conversation', 'review', 'activity'] as const;
export type TaskDetailTab = (typeof TASK_DETAIL_TABS)[number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `TaskBoardItem.delivery` is free-form JSON from Core; keep only well-formed parts. */
export const parseDelivery = (item: Pick<TaskBoardItem, 'delivery'> | null | undefined): TaskDeliveryInfo => {
  const raw = item?.delivery;
  if (!isRecord(raw)) return {};
  const out: TaskDeliveryInfo = {};
  const pr = raw.pull_request;
  if (isRecord(pr) && typeof pr.url === 'string') out.pull_request = pr as TaskDeliveryInfo['pull_request'];
  const adopt = raw.adopt;
  if (isRecord(adopt) && typeof adopt.status === 'string') out.adopt = adopt as TaskDeliveryInfo['adopt'];
  const comment = raw.issue_comment;
  if (isRecord(comment) && typeof comment.url === 'string') {
    out.issue_comment = comment as TaskDeliveryInfo['issue_comment'];
  }
  return out;
};

/** The group a task's review is about: the newest one that is not discarded or cancelled. */
export const reviewGroupFor = (groups: readonly FanoutGroup[]): FanoutGroup | null => {
  const live = groups.filter((g) => g.status !== 'discarded' && g.status !== 'cancelled');
  if (live.length === 0) return null;
  return live.toSorted((a, b) => b.updated_at - a.updated_at)[0] ?? null;
};

/** Slot to adopt: the declared winner, else the only/first slot with a branch. */
export const adoptSlotFor = (group: FanoutGroup | null): string | null => {
  if (!group) return null;
  if (group.winner_slot) return group.winner_slot;
  return group.slots.find((slot) => Boolean(slot.branch))?.slot ?? null;
};

/** Which Review actions make sense now. */
export const reviewActions = (
  item: Pick<TaskBoardItem, 'board_status' | 'status' | 'lane' | 'delivery'>,
  group: FanoutGroup | null
): { adopt: boolean; openPr: boolean; updatePr: boolean; requestChanges: boolean } => {
  const delivery = parseDelivery(item);
  const adopted = group?.status === 'adopted' || delivery.adopt?.status === 'adopted';
  const settled = item.board_status === 'done' || item.board_status === 'cancelled';
  const running = item.status === 'running';
  const hasWork = Boolean(group && adoptSlotFor(group));
  // Core opens/updates a PR only while the task waits for review or is done.
  const deliverable = (item.board_status === 'in_review' || item.board_status === 'done') && !running;
  return {
    adopt: hasWork && !adopted && !settled && !running,
    openPr: hasWork && !delivery.pull_request && deliverable,
    updatePr: Boolean(delivery.pull_request) && deliverable,
    requestChanges: Boolean(item.lane) && !settled && !running,
  };
};

export const parseTab = (value: string | null | undefined): TaskDetailTab =>
  (TASK_DETAIL_TABS as readonly string[]).includes(value ?? '') ? (value as TaskDetailTab) : 'overview';
