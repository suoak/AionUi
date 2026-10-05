import {
  createAgentAdapter,
  getDeclaredAgentCapabilities,
  type AgentAdapterPort,
  type AgentRunEvent,
} from '@/common/adapter/agentAdapter';
import type { TChatConversation, TConversationRuntimeSummary } from '@/common/config/storage';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { describe, expect, it, vi } from 'vitest';

const runtime: TConversationRuntimeSummary = {
  state: 'idle',
  can_send_message: true,
  has_task: false,
  is_processing: false,
  pending_confirmations: 0,
  turn_id: null,
  supports_midturn_delivery: false,
};

const conversation = { id: 'conversation-1', runtime } as TChatConversation;

const createPort = () => {
  let streamListener: ((message: IResponseMessage) => void) | undefined;
  const port: AgentAdapterPort = {
    createConversation: vi.fn(async () => conversation),
    ensureRuntime: vi.fn(async () => ({ runtime })),
    getConversation: vi.fn(async () => conversation),
    send: vi.fn(async () => ({ turn_id: 'turn-1' })),
    cancel: vi.fn(async () => undefined),
    respondApproval: vi.fn(async () => undefined),
    getUsage: vi.fn(async () => ({ used: 10, size: 100 })),
    subscribe: vi.fn((listener) => {
      streamListener = listener;
      return vi.fn();
    }),
  };
  return { port, emit: (message: IResponseMessage) => streamListener?.(message) };
};

const createAdapter = (port: AgentAdapterPort) =>
  createAgentAdapter({ id: 'codex', name: 'Codex', transport: 'cli' }, getDeclaredAgentCapabilities('codex'), port);

describe('agent adapter contract', () => {
  it('creates a conversation and prepares its existing runtime', async () => {
    const { port } = createPort();
    const adapter = createAdapter(port);

    await expect(adapter.createSession({ type: 'acp', extra: { backend: 'codex' } })).resolves.toBe(conversation);
    expect(port.ensureRuntime).toHaveBeenCalledWith('conversation-1');
  });

  it('delegates send and cancel without provider-specific branching', async () => {
    const { port } = createPort();
    const adapter = createAdapter(port);

    await expect(adapter.send('conversation-1', 'hello')).resolves.toEqual({ turn_id: 'turn-1' });
    await adapter.cancel('conversation-1', 'turn-1');
    expect(port.cancel).toHaveBeenCalledWith('conversation-1', 'turn-1');
  });

  it('normalizes streaming completion and failure events', () => {
    const { port, emit } = createPort();
    const events: AgentRunEvent[] = [];
    createAdapter(port).subscribe((event) => events.push(event));

    emit({ type: 'text', data: { content: 'partial' }, msg_id: 'm1', conversation_id: 'conversation-1' });
    emit({ type: 'finish', data: {}, msg_id: 'm2', conversation_id: 'conversation-1' });
    emit({ type: 'error', data: { code: 'failed' }, msg_id: 'm3', conversation_id: 'conversation-1' });

    expect(events.map((event) => event.type)).toEqual(['message.delta', 'completed', 'failed']);
  });

  it('returns isolated capability objects for each provider', () => {
    const codex = getDeclaredAgentCapabilities('codex');
    const codeBuddy = getDeclaredAgentCapabilities('codebuddy');
    const aionAgent = getDeclaredAgentCapabilities('aionrs');
    codex.nativeGoalMode = true;

    expect(codeBuddy.nativeGoalMode).toBe(false);
    expect(codeBuddy.imageInput).toBe(false);
    expect(aionAgent.imageInput).toBe(false);
    expect(getDeclaredAgentCapabilities('codex').imageInput).toBe(true);
    expect(getDeclaredAgentCapabilities('unknown').fileWrite).toBe(false);
  });

  it.each([
    ['codex', 'cli'],
    ['codebuddy', 'acp'],
    ['aionrs', 'native'],
  ] as const)('maps %s through the same adapter contract', async (id, transport) => {
    const { port } = createPort();
    const adapter = createAgentAdapter({ id, name: id, transport }, getDeclaredAgentCapabilities(id), port);

    await expect(adapter.send('conversation-1', 'hello')).resolves.toEqual({ turn_id: 'turn-1' });
    expect(adapter.identity()).toEqual({ id, name: id, transport });
  });

  it('surfaces status lookup failure instead of inventing an idle runtime', async () => {
    const { port } = createPort();
    port.getConversation = vi.fn(async () => ({ id: 'conversation-1' }) as TChatConversation);

    await expect(createAdapter(port).getStatus('conversation-1')).rejects.toThrow('agent_runtime_status_unavailable');
  });
});
