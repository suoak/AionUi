/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/hooks/agent/useManagedAgents.ts.
 *
 * The Agent settings management surface must read the
 * `include_disabled=true` view (a SEPARATE SWR key from any detected-agent
 * cache). Diagnostics-only actions can refresh the management cache only;
 * catalog-changing or health actions that affect generated assistants must also
 * invalidate assistant list caches.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: [], error: null, isLoading: false })),
  mutate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      refreshCustomAgents: { invoke: vi.fn().mockResolvedValue(undefined) },
      prepareManagedAgentRuntime: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/utils/model/agentTypes', () => ({
  MANAGED_AGENTS_SWR_KEY: 'agents.managed',
  fetchManagedAgents: vi.fn(),
}));

import {
  getManagedAgents,
  prepareManagedAgentRuntimeUntilSettled,
  useManagedAgents,
} from '@/renderer/hooks/agent/useManagedAgents';
import { ipcBridge } from '@/common';
import useSWR, { mutate } from 'swr';
import { fetchManagedAgents } from '@/renderer/utils/model/agentTypes';

describe('useManagedAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribes to the management SWR key with the managed fetcher', () => {
    (useSWR as any).mockReturnValue({ data: [], error: null, isLoading: false });

    renderHook(() => useManagedAgents());

    expect(useSWR).toHaveBeenCalledWith('agents.managed', fetchManagedAgents);
  });

  it('exposes the agents returned by SWR', () => {
    const agents = [
      { id: 'x', name: 'X', agent_type: 'acp', agent_source: 'custom', enabled: false, available: false },
    ];
    (useSWR as any).mockReturnValue({ data: agents, error: null, isLoading: false });

    const { result } = renderHook(() => useManagedAgents());

    expect(result.current.agents).toEqual(agents);
  });

  it('falls back to an empty list when SWR has no data yet', () => {
    (useSWR as any).mockReturnValue({ data: undefined, error: null, isLoading: true });

    const { result } = renderHook(() => useManagedAgents());

    expect(result.current.agents).toEqual([]);
  });

  it('revalidate refreshes only the management key', async () => {
    (useSWR as any).mockReturnValue({ data: [], error: null, isLoading: false });

    const { result } = renderHook(() => useManagedAgents());

    await act(async () => {
      await result.current.revalidate();
    });

    expect(mutate).toHaveBeenCalledWith('agents.managed');
    expect(mutate).not.toHaveBeenCalledWith('agents.detected');
  });

  it('refreshCatalog refreshes the management key and assistant list caches', async () => {
    (useSWR as any).mockReturnValue({ data: [], error: null, isLoading: false });

    const { result } = renderHook(() => useManagedAgents());

    await act(async () => {
      await result.current.refreshCatalog();
    });

    expect(mutate).toHaveBeenCalledWith('agents.managed');
    expect(mutate).toHaveBeenCalledWith('assistants.list');
  });

  it('refreshCustomAgents triggers a backend rescan then refreshes management and assistant caches', async () => {
    (useSWR as any).mockReturnValue({ data: [], error: null, isLoading: false });

    const { result } = renderHook(() => useManagedAgents());

    await act(async () => {
      await result.current.refreshCustomAgents();
    });

    expect(ipcBridge.acpConversation.refreshCustomAgents.invoke).toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledWith('agents.managed');
    expect(mutate).toHaveBeenCalledWith('assistants.list');
  });

  it('getManagedAgents fetches the management catalog without invalidating the detected cache', async () => {
    const managedAgents = [
      { id: 'managed-1', name: 'Managed Agent', agent_type: 'acp', agent_source: 'builtin', enabled: true },
    ];
    (fetchManagedAgents as any).mockResolvedValue(managedAgents);

    const result = await getManagedAgents();

    expect(fetchManagedAgents).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith('agents.managed', managedAgents, { revalidate: false });
    expect(mutate).not.toHaveBeenCalledWith('agents.detected');
    expect(result).toEqual(managedAgents);
  });
});

describe('prepareManagedAgentRuntimeUntilSettled', () => {
  const installing = {
    id: 'deepseek-harness',
    name: 'DeepSeek Harness',
    runtime: { runtime_id: 'deepseek-harness', release: '2026.08.14-1', state: 'installing' as const },
  };
  const ready = {
    ...installing,
    runtime: { ...installing.runtime, state: 'ready' as const, phase: 'ready', progress: 100 },
  };

  it('returns immediately when the catalog already reports ready', async () => {
    vi.mocked(ipcBridge.acpConversation.prepareManagedAgentRuntime.invoke).mockResolvedValue(ready as never);
    vi.mocked(mutate).mockResolvedValue(undefined);

    await expect(prepareManagedAgentRuntimeUntilSettled('deepseek-harness')).resolves.toEqual(ready);
    expect(ipcBridge.acpConversation.prepareManagedAgentRuntime.invoke).toHaveBeenCalledWith({
      id: 'deepseek-harness',
    });
  });

  it('polls the catalog until a background install becomes ready', async () => {
    vi.mocked(ipcBridge.acpConversation.prepareManagedAgentRuntime.invoke).mockResolvedValue(installing as never);
    vi.mocked(mutate)
      .mockResolvedValueOnce([installing])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([ready])
      .mockResolvedValueOnce(undefined);

    await expect(
      prepareManagedAgentRuntimeUntilSettled('deepseek-harness', {
        sleep: async () => undefined,
        pollIntervalMs: 1,
        timeoutMs: 10_000,
      })
    ).resolves.toEqual(ready);
  });

  it('returns a failed runtime without treating it as a timeout', async () => {
    const failed = {
      ...installing,
      runtime: { ...installing.runtime, state: 'failed' as const, phase: 'failed' },
    };
    vi.mocked(ipcBridge.acpConversation.prepareManagedAgentRuntime.invoke).mockResolvedValue(failed as never);
    vi.mocked(mutate).mockResolvedValue([failed]);

    await expect(prepareManagedAgentRuntimeUntilSettled('deepseek-harness')).resolves.toEqual(failed);
  });

  it('rejects when the installer is still running after the timeout', async () => {
    vi.mocked(ipcBridge.acpConversation.prepareManagedAgentRuntime.invoke).mockResolvedValue(installing as never);
    vi.mocked(mutate).mockResolvedValue([installing]);
    let now = 0;

    await expect(
      prepareManagedAgentRuntimeUntilSettled('deepseek-harness', {
        now: () => now,
        sleep: async () => {
          now += 10_000;
        },
        pollIntervalMs: 1,
        timeoutMs: 5_000,
      })
    ).rejects.toThrow('Managed runtime installation timed out');
  });
});
