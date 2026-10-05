import type { TChatConversation, TConversationRuntimeSummary } from '@/common/config/storage';
import { conversation } from './ipcBridge';
import type { ICreateConversationParams, IResponseMessage } from './ipcBridge';

export type AgentIdentity = {
  id: string;
  name: string;
  transport: 'acp' | 'cli' | 'native';
};

export type AgentCapabilities = {
  streaming: boolean;
  fileRead: boolean;
  fileWrite: boolean;
  shell: boolean;
  mcp: boolean;
  skills: boolean;
  subagents: boolean;
  sessionResume: boolean;
  checkpoint: boolean;
  nativePlanMode: boolean;
  nativeGoalMode: boolean;
  imageInput: boolean;
};

export type AgentRunEvent =
  | { type: 'started'; conversationId: string; turnId?: string }
  | { type: 'message.delta'; conversationId: string; content: string; messageId: string }
  | { type: 'message.completed'; conversationId: string; messageId: string }
  | {
      type: 'tool.requested' | 'tool.started' | 'tool.completed' | 'tool.failed';
      conversationId: string;
      data: unknown;
    }
  | { type: 'approval.requested'; conversationId: string; data: unknown }
  | { type: 'usage.updated'; conversationId: string; data: unknown }
  | { type: 'completed' | 'failed' | 'cancelled'; conversationId: string; data?: unknown };

export type AgentUsage = { used: number; size: number; cost?: { amount: number; currency: string } } | null;

export type AgentAdapterPort = {
  createConversation(input: ICreateConversationParams): Promise<TChatConversation>;
  ensureRuntime(conversationId: string): Promise<{ runtime: TConversationRuntimeSummary }>;
  getConversation(conversationId: string): Promise<TChatConversation>;
  send(conversationId: string, input: string): Promise<{ turn_id: string }>;
  cancel(conversationId: string, turnId: string): Promise<void>;
  respondApproval(input: {
    conversationId: string;
    messageId: string;
    callId: string;
    decision: unknown;
    alwaysAllow: boolean;
  }): Promise<void>;
  getUsage(conversationId: string): Promise<AgentUsage>;
  subscribe(listener: (message: IResponseMessage) => void): () => void;
};

export type AgentAdapter = {
  identity(): AgentIdentity;
  capabilities(): AgentCapabilities;
  createSession(input: ICreateConversationParams): Promise<TChatConversation>;
  resumeSession(conversationId: string): Promise<{ runtime: TConversationRuntimeSummary }>;
  send(conversationId: string, input: string): Promise<{ turn_id: string }>;
  cancel(conversationId: string, turnId: string): Promise<void>;
  getStatus(conversationId: string): Promise<TConversationRuntimeSummary>;
  approve(conversationId: string, messageId: string, callId: string, decision: unknown): Promise<void>;
  reject(conversationId: string, messageId: string, callId: string, decision: unknown): Promise<void>;
  getUsage(conversationId: string): Promise<AgentUsage>;
  subscribe(listener: (event: AgentRunEvent) => void): () => void;
};

const CONSERVATIVE_CAPABILITIES = {
  codex: {
    streaming: true,
    fileRead: true,
    fileWrite: true,
    shell: true,
    mcp: true,
    skills: true,
    subagents: false,
    sessionResume: true,
    checkpoint: false,
    nativePlanMode: false,
    nativeGoalMode: false,
    imageInput: true,
  },
  claude: {
    streaming: true,
    fileRead: true,
    fileWrite: true,
    shell: true,
    mcp: true,
    skills: true,
    subagents: false,
    sessionResume: true,
    checkpoint: false,
    nativePlanMode: false,
    nativeGoalMode: false,
    imageInput: true,
  },
  codebuddy: {
    streaming: true,
    fileRead: true,
    fileWrite: true,
    shell: true,
    mcp: true,
    skills: true,
    subagents: false,
    sessionResume: true,
    checkpoint: false,
    nativePlanMode: false,
    nativeGoalMode: false,
    imageInput: false,
  },
  aionrs: {
    streaming: true,
    fileRead: true,
    fileWrite: true,
    shell: true,
    mcp: true,
    skills: true,
    subagents: false,
    sessionResume: true,
    checkpoint: false,
    nativePlanMode: false,
    nativeGoalMode: false,
    imageInput: false,
  },
} as const satisfies Record<string, AgentCapabilities>;

const UNKNOWN_CAPABILITIES: AgentCapabilities = {
  streaming: true,
  fileRead: false,
  fileWrite: false,
  shell: false,
  mcp: false,
  skills: false,
  subagents: false,
  sessionResume: false,
  checkpoint: false,
  nativePlanMode: false,
  nativeGoalMode: false,
  imageInput: false,
};

export const getDeclaredAgentCapabilities = (agentId: string): AgentCapabilities => ({
  ...(CONSERVATIVE_CAPABILITIES[agentId.toLowerCase() as keyof typeof CONSERVATIVE_CAPABILITIES] ??
    UNKNOWN_CAPABILITIES),
});

const dataRecord = (data: unknown): Record<string, unknown> =>
  typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

export const normalizeAgentRunEvent = (message: IResponseMessage): AgentRunEvent | null => {
  const base = { conversationId: message.conversation_id };
  const data = dataRecord(message.data);
  switch (message.type) {
    case 'start':
      return { type: 'started', ...base, turnId: message.turn_id };
    case 'text':
    case 'content':
      return {
        type: message.status === 'finish' ? 'message.completed' : 'message.delta',
        ...base,
        messageId: message.msg_id,
        ...(message.status === 'finish' ? {} : { content: String(data.content ?? '') }),
      } as AgentRunEvent;
    case 'tool_call':
    case 'acp_tool_call': {
      const status = String(data.status ?? '').toLowerCase();
      const type = status.includes('fail')
        ? 'tool.failed'
        : status.includes('complete') || status === 'completed'
          ? 'tool.completed'
          : status.includes('start') || status === 'in_progress'
            ? 'tool.started'
            : 'tool.requested';
      return { type, ...base, data: message.data };
    }
    case 'permission':
    case 'acp_permission':
    case 'ask':
      return { type: 'approval.requested', ...base, data: message.data };
    case 'usage':
    case 'acp_context_usage':
      return { type: 'usage.updated', ...base, data: message.data };
    case 'finish':
      return { type: 'completed', ...base, data: message.data };
    case 'error':
      return { type: 'failed', ...base, data: message.data };
    case 'cancelled':
      return { type: 'cancelled', ...base, data: message.data };
    default:
      return null;
  }
};

export const createAgentAdapter = (
  adapterIdentity: AgentIdentity,
  adapterCapabilities: AgentCapabilities,
  port: AgentAdapterPort
): AgentAdapter => ({
  identity: () => ({ ...adapterIdentity }),
  capabilities: () => ({ ...adapterCapabilities }),
  createSession: async (input) => {
    const createdConversation = await port.createConversation(input);
    await port.ensureRuntime(createdConversation.id);
    return createdConversation;
  },
  resumeSession: (conversationId) => port.ensureRuntime(conversationId),
  send: (conversationId, input) => port.send(conversationId, input),
  cancel: (conversationId, turnId) => port.cancel(conversationId, turnId),
  getStatus: async (conversationId) => {
    const runtime = (await port.getConversation(conversationId)).runtime;
    if (!runtime) throw new Error('agent_runtime_status_unavailable');
    return runtime;
  },
  approve: (conversationId, messageId, callId, decision) =>
    port.respondApproval({ conversationId, messageId, callId, decision, alwaysAllow: false }),
  reject: (conversationId, messageId, callId, decision) =>
    port.respondApproval({ conversationId, messageId, callId, decision, alwaysAllow: false }),
  getUsage: (conversationId) => port.getUsage(conversationId),
  subscribe: (listener) =>
    port.subscribe((message) => {
      const event = normalizeAgentRunEvent(message);
      if (event) listener(event);
    }),
});

export const createIpcAgentAdapter = (identity: AgentIdentity): AgentAdapter =>
  createAgentAdapter(identity, getDeclaredAgentCapabilities(identity.id), {
    createConversation: (input) => conversation.create.invoke(input),
    ensureRuntime: (conversationId) => conversation.ensureRuntime.invoke({ conversation_id: conversationId }),
    getConversation: (conversationId) => conversation.get.invoke({ id: conversationId }),
    send: (conversationId, input) => conversation.sendMessage.invoke({ conversation_id: conversationId, input }),
    cancel: async (conversationId, turnId) => {
      await conversation.stop.invoke({ conversation_id: conversationId, turn_id: turnId });
    },
    respondApproval: async ({ conversationId, messageId, callId, decision, alwaysAllow }) => {
      await conversation.confirmation.confirm.invoke({
        conversation_id: conversationId,
        msg_id: messageId,
        call_id: callId,
        data: decision,
        always_allow: alwaysAllow,
      });
    },
    getUsage: (conversationId) => conversation.getUsage.invoke({ conversation_id: conversationId }),
    subscribe: (listener) => conversation.responseStream.on(listener),
  });
