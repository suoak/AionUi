/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure helpers for fan-out groups (M7 E3-5). No React.
 * Core owns every git decision; these only shape requests and read results.
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import {
  FANOUT_DEFAULT_SLOTS,
  FANOUT_MAX_SLOTS,
  FANOUT_MIN_SLOTS,
  type AdoptFanoutInput,
  type FanoutAdoptStrategy,
  type FanoutCompare,
  type FanoutGroup,
  type FanoutGroupStatus,
  type FanoutSlot,
  type FanoutSlotInput,
} from '@/common/types/fanout';
import type { WorktreeEstimate } from '@/common/types/worktree';

const TERMINAL_GROUP_STATUSES = new Set<string>(['adopted', 'discarded', 'cancelled', 'failed']);
const LIVE_SLOT_STATUSES = new Set<string>(['preparing', 'starting', 'running']);

/** Error codes with a dedicated message (`conversation.fanout.errors.*`). */
const KNOWN_ERROR_CODES = new Set([
  'FANOUT_LIMIT',
  'FANOUT_INVALID_STATE',
  'FANOUT_UNAVAILABLE',
  'SLOT_BUSY',
  'ADOPT_CONFLICT',
  'TARGET_NOT_CLEAN',
  'SLOT_START_FAILED',
]);

export const isFanoutTerminal = (status: FanoutGroupStatus | undefined | null): boolean =>
  Boolean(status && TERMINAL_GROUP_STATUSES.has(status));

/** Something is still preparing / running: poll and offer Cancel. */
export const isFanoutLive = (group: Pick<FanoutGroup, 'status' | 'slots'> | undefined | null): boolean =>
  Boolean(
    group &&
    !isFanoutTerminal(group.status) &&
    (group.status === 'preparing' ||
      group.status === 'running' ||
      group.slots.some((slot) => LIVE_SLOT_STATUSES.has(slot.status)))
  );

/** A slot can win once its run ended without error and the group is open. */
export const canAdoptSlot = (group: Pick<FanoutGroup, 'status'>, slot: Pick<FanoutSlot, 'status'>): boolean =>
  !isFanoutTerminal(group.status) && slot.status === 'finished';

export const canDiscardGroup = (group: Pick<FanoutGroup, 'status'> | undefined | null): boolean =>
  Boolean(group && !isFanoutTerminal(group.status));

export const fanoutErrorKey = (code: string | undefined | null): string =>
  code && KNOWN_ERROR_CODES.has(code) ? `conversation.fanout.errors.${code}` : 'conversation.fanout.errors.UNKNOWN';

/**
 * Old Core (no `/api/fanout-groups*`: 404 without a fan-out code) or a Core
 * that reports the feature off (503 `FANOUT_UNAVAILABLE`): degrade to the
 * "fan-out unavailable" notice instead of a generic failure.
 */
export const isFanoutUnavailableError = (error: unknown): boolean => {
  if (!isBackendHttpError(error)) return false;
  if (error.code === 'FANOUT_UNAVAILABLE') return true;
  return error.status === 404 && !KNOWN_ERROR_CODES.has(error.code);
};

/** Clamp a requested slot count to Core's 2..5. */
export const clampSlotCount = (count: number): number =>
  Math.min(FANOUT_MAX_SLOTS, Math.max(FANOUT_MIN_SLOTS, Math.round(count) || FANOUT_DEFAULT_SLOTS));

/**
 * Default slot assistants: the selected one first, then other enabled
 * assistants; repeats the selected one when there are not enough.
 */
export const defaultSlotAssistants = (
  selectedId: string | null | undefined,
  available: { id: string; enabled?: boolean }[],
  count: number = FANOUT_DEFAULT_SLOTS
): string[] => {
  const size = clampSlotCount(count);
  const ids = available.filter((item) => item.enabled !== false).map((item) => item.id);
  const first = selectedId || ids[0];
  if (!first) return [];
  const others = ids.filter((id) => id !== first);
  const out = [first];
  for (let i = 0; out.length < size; i += 1) out.push(others[i] ?? first);
  return out;
};

/** Slot payload: assistant ids only; every slot runs with that assistant's own permission mode. */
export const buildFanoutSlots = (assistantIds: string[]): FanoutSlotInput[] =>
  assistantIds.filter(Boolean).map((assistant_id) => ({ assistant_id }));

export const isValidSlotCount = (count: number): boolean => count >= FANOUT_MIN_SLOTS && count <= FANOUT_MAX_SLOTS;

export type AdoptFormState = {
  strategy: FanoutAdoptStrategy;
  targetBranch: string;
  snapshotMessage: string;
  removeOthers: boolean;
  keepBranches: boolean;
};

export const DEFAULT_ADOPT_FORM: AdoptFormState = {
  strategy: 'branch_only',
  targetBranch: '',
  snapshotMessage: '',
  removeOthers: true,
  keepBranches: false,
};

export const buildAdoptRequest = (groupId: string, slot: string, form: AdoptFormState): AdoptFanoutInput => {
  const req: AdoptFanoutInput = {
    id: groupId,
    slot,
    strategy: form.strategy,
    cleanup: { remove_others: form.removeOthers, keep_branches: form.keepBranches },
  };
  const target = form.targetBranch.trim();
  if (target && form.strategy !== 'branch_only') req.target_branch = target;
  const message = form.snapshotMessage.trim();
  if (message) req.snapshot_message = message;
  return req;
};

/** Per-slot totals for the compare header (files changed, +, −). */
export const compareTotals = (
  compare: Pick<FanoutCompare, 'slots'>
): Record<string, { files: number; additions: number; deletions: number }> =>
  Object.fromEntries(
    compare.slots.map((slot) => [
      slot.slot,
      {
        files: slot.diff?.files_changed ?? 0,
        additions: slot.diff?.additions ?? 0,
        deletions: slot.diff?.deletions ?? 0,
      },
    ])
  );

/** Short commit id for display. */
export const shortCommit = (commit: string | null | undefined): string => (commit ? commit.slice(0, 8) : '');

/**
 * Disk estimate for `count` slots (design E3 §3: tracked size × N). `null`
 * when Core has no estimate, so the caller shows the generic text.
 */
export const fanoutDiskEstimate = (
  estimate: Pick<WorktreeEstimate, 'tracked_bytes' | 'tracked_files' | 'truncated'> | null | undefined,
  count: number
): { bytes: number; files: number; truncated: boolean } | null => {
  if (!estimate || !Number.isFinite(estimate.tracked_bytes) || count <= 0) return null;
  return {
    bytes: estimate.tracked_bytes * count,
    files: estimate.tracked_files,
    truncated: Boolean(estimate.truncated),
  };
};

/** Recent groups for the sider: newest first, live ones before finished ones. */
export const siderFanoutGroups = (groups: FanoutGroup[] | null | undefined, limit = 8): FanoutGroup[] =>
  [...(groups ?? [])]
    .sort((a, b) => {
      const live = Number(isFanoutTerminal(a.status)) - Number(isFanoutTerminal(b.status));
      return live !== 0 ? live : b.updated_at - a.updated_at;
    })
    .slice(0, limit);
