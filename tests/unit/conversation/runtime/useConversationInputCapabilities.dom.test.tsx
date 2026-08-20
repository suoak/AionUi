/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { Message } from '@arco-design/web-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IConversationCapabilities } from '@/common/adapter/ipcBridge';
import { useConversationInputCapabilities } from '@/renderer/pages/conversation/platforms/useConversationInputCapabilities';

const capabilityListeners = vi.hoisted(() => ({
  current: [] as Array<(event: { conversation_id: string; capabilities: IConversationCapabilities }) => void>,
}));
const getCapabilitiesMock = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      getCapabilities: { invoke: getCapabilitiesMock.invoke },
      capabilitiesChanged: {
        on: vi.fn((listener: (event: { conversation_id: string; capabilities: IConversationCapabilities }) => void) => {
          capabilityListeners.current.push(listener);
          return () => {
            capabilityListeners.current = capabilityListeners.current.filter((item) => item !== listener);
          };
        }),
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    info: vi.fn(),
  },
}));

const capabilities = (overrides: Partial<IConversationCapabilities> = {}): IConversationCapabilities => ({
  followup: true,
  steer: false,
  inject: false,
  tool_enforcement: 'native',
  ...overrides,
});

describe('useConversationInputCapabilities', () => {
  beforeEach(() => {
    capabilityListeners.current = [];
    vi.clearAllMocks();
    getCapabilitiesMock.invoke.mockResolvedValue(capabilities({ inject: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads capabilities from the conversation snapshot, not the backend name', async () => {
    const { result } = renderHook(() => useConversationInputCapabilities('conv-1'));

    await waitFor(() => expect(result.current.capabilities?.inject).toBe(true));
    expect(result.current.hasAlternateInputModes).toBe(true);
    expect(result.current.inputMode).toBe('followup');
    expect(getCapabilitiesMock.invoke).toHaveBeenCalledWith({ conversation_id: 'conv-1' });
  });

  it('falls back to followup when the selected mode is no longer supported', async () => {
    const { result } = renderHook(() => useConversationInputCapabilities('conv-steer'));

    await waitFor(() => expect(result.current.capabilities).not.toBeNull());
    act(() => {
      result.current.setInputMode('steer');
    });
    expect(result.current.inputMode).toBe('steer');

    act(() => {
      capabilityListeners.current.forEach((listener) => {
        listener({
          conversation_id: 'conv-steer',
          capabilities: capabilities({ steer: false, inject: true }),
        });
      });
    });

    expect(result.current.inputMode).toBe('followup');
    expect(result.current.capabilities?.inject).toBe(true);
    expect(Message.info).toHaveBeenCalledTimes(1);
  });

  it('keeps the selected mode when it remains supported after a capability change', async () => {
    getCapabilitiesMock.invoke.mockResolvedValue(capabilities({ steer: true }));
    const { result } = renderHook(() => useConversationInputCapabilities('conv-keep'));

    await waitFor(() => expect(result.current.capabilities?.steer).toBe(true));
    act(() => {
      result.current.setInputMode('steer');
    });

    act(() => {
      capabilityListeners.current.forEach((listener) => {
        listener({
          conversation_id: 'conv-keep',
          capabilities: capabilities({ steer: true, inject: true, revision: 2 }),
        });
      });
    });

    expect(result.current.inputMode).toBe('steer');
    expect(Message.info).not.toHaveBeenCalled();
  });
});
