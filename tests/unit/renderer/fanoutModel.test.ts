/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { BackendHttpError } from '@/common/adapter/httpBridge';
import {
  DEFAULT_ADOPT_FORM,
  buildAdoptRequest,
  buildFanoutSlots,
  canAdoptSlot,
  canDiscardGroup,
  clampSlotCount,
  compareTotals,
  defaultSlotAssistants,
  fanoutErrorKey,
  isFanoutLive,
  isFanoutTerminal,
  isFanoutUnavailableError,
  isValidSlotCount,
  shortCommit,
} from '@/renderer/pages/conversation/fanout/fanoutModel';
import type { FanoutCompare, FanoutGroup } from '@/common/types/fanout';

const httpError = (status: number, code?: string) =>
  new BackendHttpError({
    method: 'POST',
    path: '/api/fanout-groups',
    status,
    body: code ? { success: false, error: 'x', code } : 'Not Found',
  });

const group = (status: string, slotStatuses: string[]) =>
  ({ status, slots: slotStatuses.map((s, i) => ({ slot: 'ABCDE'[i], status: s })) }) as unknown as FanoutGroup;

describe('fanoutModel', () => {
  it('classifies terminal and live groups', () => {
    expect(isFanoutTerminal('adopted')).toBe(true);
    expect(isFanoutTerminal('discarded')).toBe(true);
    expect(isFanoutTerminal('comparing')).toBe(false);
    expect(isFanoutTerminal(undefined)).toBe(false);
    expect(isFanoutLive(group('running', ['running', 'finished']))).toBe(true);
    expect(isFanoutLive(group('comparing', ['finished', 'starting']))).toBe(true);
    expect(isFanoutLive(group('comparing', ['finished', 'failed']))).toBe(false);
    expect(isFanoutLive(group('cancelled', ['running']))).toBe(false);
  });

  it('only finished slots of an open group can be adopted', () => {
    expect(canAdoptSlot({ status: 'comparing' } as FanoutGroup, { status: 'finished' } as never)).toBe(true);
    expect(canAdoptSlot({ status: 'comparing' } as FanoutGroup, { status: 'running' } as never)).toBe(false);
    expect(canAdoptSlot({ status: 'adopted' } as FanoutGroup, { status: 'finished' } as never)).toBe(false);
    expect(canDiscardGroup({ status: 'running' } as FanoutGroup)).toBe(true);
    expect(canDiscardGroup({ status: 'discarded' } as FanoutGroup)).toBe(false);
  });

  it('maps error codes and detects an old or disabled Core', () => {
    expect(fanoutErrorKey('ADOPT_CONFLICT')).toBe('conversation.fanout.errors.ADOPT_CONFLICT');
    expect(fanoutErrorKey('NOPE')).toBe('conversation.fanout.errors.UNKNOWN');
    expect(fanoutErrorKey(undefined)).toBe('conversation.fanout.errors.UNKNOWN');
    expect(isFanoutUnavailableError(httpError(404))).toBe(true);
    expect(isFanoutUnavailableError(httpError(503, 'FANOUT_UNAVAILABLE'))).toBe(true);
    expect(isFanoutUnavailableError(httpError(404, 'FANOUT_INVALID_STATE'))).toBe(false);
    expect(isFanoutUnavailableError(httpError(400, 'FANOUT_LIMIT'))).toBe(false);
    expect(isFanoutUnavailableError(new Error('boom'))).toBe(false);
  });

  it('keeps slot counts within 2..5', () => {
    expect(clampSlotCount(1)).toBe(2);
    expect(clampSlotCount(9)).toBe(5);
    expect(clampSlotCount(Number.NaN)).toBe(3);
    expect(isValidSlotCount(1)).toBe(false);
    expect(isValidSlotCount(2)).toBe(true);
    expect(isValidSlotCount(5)).toBe(true);
    expect(isValidSlotCount(6)).toBe(false);
  });

  it('defaults slot assistants to the selected one first, then others, repeating when short', () => {
    const available = [{ id: 'a' }, { id: 'b', enabled: false }, { id: 'c' }];
    expect(defaultSlotAssistants('c', available)).toEqual(['c', 'a', 'c']);
    expect(defaultSlotAssistants(null, available, 2)).toEqual(['a', 'c']);
    expect(defaultSlotAssistants(null, [])).toEqual([]);
  });

  it('builds slot payloads without any permission override', () => {
    expect(buildFanoutSlots(['a', '', 'b'])).toEqual([{ assistant_id: 'a' }, { assistant_id: 'b' }]);
  });

  it('builds adopt requests, sending target_branch only when merging', () => {
    expect(buildAdoptRequest('g1', 'A', { ...DEFAULT_ADOPT_FORM, targetBranch: 'main' })).toEqual({
      id: 'g1',
      slot: 'A',
      strategy: 'branch_only',
      cleanup: { remove_others: true, keep_branches: false },
    });
    expect(
      buildAdoptRequest('g1', 'B', {
        strategy: 'squash',
        targetBranch: ' main ',
        snapshotMessage: ' msg ',
        removeOthers: false,
        keepBranches: true,
      })
    ).toEqual({
      id: 'g1',
      slot: 'B',
      strategy: 'squash',
      target_branch: 'main',
      snapshot_message: 'msg',
      cleanup: { remove_others: false, keep_branches: true },
    });
  });

  it('summarizes compare totals and shortens commits', () => {
    const compare = {
      slots: [
        { slot: 'A', diff: { files_changed: 2, additions: 10, deletions: 3 } },
        { slot: 'B', diff: null },
      ],
    } as unknown as FanoutCompare;
    expect(compareTotals(compare)).toEqual({
      A: { files: 2, additions: 10, deletions: 3 },
      B: { files: 0, additions: 0, deletions: 0 },
    });
    expect(shortCommit('0123456789abcdef')).toBe('01234567');
    expect(shortCommit(null)).toBe('');
  });
});
