/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationInput } from '@/common/adapter/ipcBridge';
import { describe, expect, it } from 'vitest';
import {
  getCommandQueueExecutionGate,
  isDraftBoxServerInputStatus,
  mergeDraftBoxServerInput,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';

const serverInput = (overrides: Partial<IConversationInput> = {}): IConversationInput => ({
  input_id: 'input-1',
  conversation_id: 'conv-1',
  mode: 'followup',
  status: 'held',
  content: 'queued follow-up',
  files: [],
  inject_skills: [],
  hidden: false,
  client_key: 'client-1',
  created_at: 1,
  updated_at: 1,
  ...overrides,
});

describe('getCommandQueueExecutionGate', () => {
  it('keeps the legacy path gated by hydration and busy state', () => {
    expect(getCommandQueueExecutionGate({ isBusy: true, isHydrated: true })).toEqual({
      hydrated: true,
      canExecute: false,
      isProcessing: true,
    });

    expect(getCommandQueueExecutionGate({ isBusy: false, isHydrated: false })).toEqual({
      hydrated: false,
      canExecute: true,
      isProcessing: false,
    });
  });

  it('does not execute runtime-gated commands before hydration', () => {
    expect(
      getCommandQueueExecutionGate({
        isBusy: false,
        runtimeGate: {
          hydrated: false,
          canSendMessage: true,
          isProcessing: false,
        },
      })
    ).toEqual({
      hydrated: false,
      canExecute: true,
      isProcessing: false,
    });
  });

  it('does not execute when runtime cannot send', () => {
    expect(
      getCommandQueueExecutionGate({
        isBusy: false,
        runtimeGate: {
          hydrated: true,
          canSendMessage: false,
          isProcessing: false,
        },
      })
    ).toEqual({
      hydrated: true,
      canExecute: false,
      isProcessing: false,
    });
  });

  it('does not execute while runtime is processing', () => {
    expect(
      getCommandQueueExecutionGate({
        isBusy: false,
        runtimeGate: {
          hydrated: true,
          canSendMessage: true,
          isProcessing: true,
        },
      })
    ).toEqual({
      hydrated: true,
      canExecute: false,
      isProcessing: true,
    });
  });

  it('executes only when runtime is hydrated, sendable, and idle', () => {
    expect(
      getCommandQueueExecutionGate({
        isBusy: true,
        runtimeGate: {
          hydrated: true,
          canSendMessage: true,
          isProcessing: false,
        },
      })
    ).toEqual({
      hydrated: true,
      canExecute: true,
      isProcessing: false,
    });
  });
});

describe('draft box server input visibility', () => {
  it('keeps pending and failed inputs in the draft box', () => {
    expect(isDraftBoxServerInputStatus('held')).toBe(true);
    expect(isDraftBoxServerInputStatus('dispatching')).toBe(true);
    expect(isDraftBoxServerInputStatus('accepted')).toBe(true);
    expect(isDraftBoxServerInputStatus('failed')).toBe(true);
  });

  it('drops applied and canceled inputs that already left the send queue', () => {
    expect(isDraftBoxServerInputStatus('applied')).toBe(false);
    expect(isDraftBoxServerInputStatus('canceled')).toBe(false);
  });

  it('removes an input from the draft box once it is applied', () => {
    const held = serverInput({ status: 'held' });
    expect(mergeDraftBoxServerInput([held], { ...held, status: 'applied', updated_at: 2 })).toEqual([]);
  });

  it('keeps a failed replacement so the user can retry', () => {
    const held = serverInput({ status: 'held' });
    const failed = serverInput({ status: 'failed', error_code: 'SEND_FAILED', updated_at: 2 });
    expect(mergeDraftBoxServerInput([held], failed)).toEqual([failed]);
  });
});
