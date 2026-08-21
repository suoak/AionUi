/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type HttpCall = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
};

const httpBridgeMocks = vi.hoisted(() => {
  const calls: HttpCall[] = [];
  const responses = new Map<string, unknown>();
  const provider =
    (method: HttpCall['method']) =>
    <Data, Params = undefined>(path: string | ((params: Params) => string), mapBody?: (params: Params) => unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async (params?: Params) => {
        const resolvedPath = typeof path === 'function' ? path(params as Params) : path;
        calls.push({
          method,
          path: resolvedPath,
          body: mapBody && params !== undefined ? mapBody(params as Params) : undefined,
        });
        return (responses.has(resolvedPath) ? responses.get(resolvedPath) : true) as Data;
      }),
    });
  const emitter = () => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() });

  return {
    calls,
    responses,
    httpGet: provider('GET'),
    httpPost: provider('POST'),
    httpPut: provider('PUT'),
    httpPatch: provider('PATCH'),
    httpDelete: provider('DELETE'),
    httpRequest: vi.fn(),
    stubProvider: vi.fn((name: string, defaultValue: unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async () => defaultValue),
    })),
    withResponseMap: vi.fn(
      (
        inner: { provider: unknown; invoke: (params?: unknown) => Promise<unknown> },
        map: (raw: unknown) => unknown
      ) => ({
        provider: inner.provider,
        invoke: vi.fn(async (params?: unknown) => map(await inner.invoke(params))),
      })
    ),
    wsEmitter: vi.fn(emitter),
    wsMappedEmitter: vi.fn(emitter),
    stubEmitter: vi.fn(emitter),
  };
});

vi.mock('@/common/adapter/httpBridge', () => httpBridgeMocks);

vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({
      provider: vi.fn(),
      invoke: vi.fn(),
    })),
    buildEmitter: vi.fn(() => ({
      on: vi.fn(() => vi.fn()),
      emit: vi.fn(),
    })),
  },
}));

describe('ipcBridge conversation adapter', () => {
  beforeEach(() => {
    httpBridgeMocks.calls.length = 0;
    httpBridgeMocks.responses.clear();
  });

  it('deletes conversations through the standard conversation endpoint', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');

    await conversation.remove.invoke({ id: 'conv-1' });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'DELETE',
      path: '/api/conversations/conv-1',
      body: undefined,
    });
  });

  // Not formality: when the body mapping drops `sessions`, NEITHER side errors.
  // The user picks a target with `@@`, the message sends fine, and the agent
  // simply never sees the session block — the most likely silent failure in the
  // whole feature.
  it('puts `@@` session references on the wire', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');

    await conversation.sendMessage.invoke({
      input: 'ask them',
      conversation_id: 'conv-1',
      sessions: [{ id: 'conv-target' }],
    });

    const call = httpBridgeMocks.calls.find((entry) => entry.path === '/api/conversations/conv-1/messages');
    expect(call).toBeDefined();
    expect(call?.body).toMatchObject({ content: 'ask them', sessions: [{ id: 'conv-target' }] });
  });

  it('omits `sessions` entirely when the user referenced nothing', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');

    await conversation.sendMessage.invoke({ input: 'plain', conversation_id: 'conv-2' });

    const call = httpBridgeMocks.calls.find((entry) => entry.path === '/api/conversations/conv-2/messages');
    expect(call).toBeDefined();
    expect((call?.body as { sessions?: unknown } | undefined)?.sessions).toBeUndefined();
  });

  it('reads the cross-session master switch off the typed settings endpoint, not the client KV', async () => {
    // Channel matters: this switch is a typed column (migration 040), so it must
    // NOT go through `/api/settings/client`.
    const { systemSettings } = await import('@/common/adapter/ipcBridge');

    await systemSettings.setCrossSessionMessageEnabled.invoke({ enabled: false });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'PATCH',
      path: '/api/settings',
      body: { cross_session_message_enabled: false },
    });
  });

  it('builds the mentionable query with the current conversation excluded', async () => {
    const { sessionMention } = await import('@/common/adapter/ipcBridge');

    await sessionMention.list.invoke({ current_conversation_id: 'conv-here', q: 'auth', limit: 20 });

    const call = httpBridgeMocks.calls.find((entry) => entry.path.startsWith('/api/session-messages/mentionable'));
    expect(call?.path).toContain('current_conversation_id=conv-here');
    expect(call?.path).toContain('q=auth');
    expect(call?.path).toContain('limit=20');
  });
});

describe('ipcBridge assistant adapter', () => {
  beforeEach(() => {
    httpBridgeMocks.calls.length = 0;
    httpBridgeMocks.responses.clear();
  });

  it('normalizes sparse generated assistants without dropping the catalog', async () => {
    httpBridgeMocks.responses.set('/api/assistants', [
      {
        id: 'bare:agent-aionrs',
        source: 'generated',
        name: 'Aion CLI',
        enabled: true,
        sort_order: -1,
        agent_id: 'agent-aionrs',
        agent_status: 'online',
        team_selectable: true,
        deletable: false,
      },
    ]);
    const { assistants } = await import('@/common/adapter/ipcBridge');

    const result = await assistants.list.invoke();

    expect(result).toEqual([
      expect.objectContaining({
        id: 'bare:agent-aionrs',
        name: 'CSBU WorkMate',
        name_i18n: {},
        description_i18n: {},
        enabled_skills: [],
        custom_skill_names: [],
        disabled_builtin_skills: [],
        context_i18n: {},
        prompts: [],
        prompts_i18n: {},
        models: [],
      }),
    ]);
  });

  it('returns a normalized assistant after a sparse create response', async () => {
    httpBridgeMocks.responses.set('/api/assistants', {
      id: 'custom-1',
      source: 'user',
      name: 'New assistant',
      enabled: true,
      sort_order: 0,
      agent_id: 'agent-codex',
      agent_status: 'online',
      team_selectable: true,
      deletable: true,
    });
    const { assistants } = await import('@/common/adapter/ipcBridge');

    const result = await assistants.create.invoke({
      name: 'New assistant',
      agent_id: 'agent-codex',
    });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'POST',
      path: '/api/assistants',
      body: undefined,
    });
    expect(result).toMatchObject({
      id: 'custom-1',
      name: 'New assistant',
      name_i18n: {},
      description_i18n: {},
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: [],
      prompts_i18n: {},
      models: [],
    });
  });

  it('normalizes omitted collections in sparse assistant details', async () => {
    httpBridgeMocks.responses.set('/api/assistants/bare%3Aagent-aionrs?locale=zh-CN', {
      id: 'bare:agent-aionrs',
      source: 'generated',
      agent_status: 'online',
      team_selectable: true,
      deletable: false,
      profile: { name: 'Aion Assistant' },
      state: { enabled: true, sort_order: -1 },
      engine: { agent_id: 'agent-aionrs' },
      rules: { content: 'Use AionUi safely.', storage_mode: 'user_file' },
      prompts: {},
      defaults: {
        model: { mode: 'auto' },
        permission: { mode: 'auto' },
        thought_level: { mode: 'auto' },
        skills: { mode: 'fixed' },
        mcps: { mode: 'auto' },
      },
      capabilities: {},
      preferences: {},
    });
    const { assistants } = await import('@/common/adapter/ipcBridge');

    const result = await assistants.get.invoke({ id: 'bare:agent-aionrs', locale: 'zh-CN' });

    expect(result.profile).toMatchObject({
      name: 'CSBU WorkMate',
      name_i18n: {},
      description_i18n: {},
    });
    expect(result.rules.content).toBe('Use CSBU WorkMate safely.');
    expect(result.prompts).toEqual({ recommended: [], recommended_i18n: {} });
    expect(result.defaults.skills.value).toEqual([]);
    expect(result.defaults.mcps.value).toEqual([]);
    expect(result.capabilities).toEqual({
      default_skill_ids: [],
      custom_skill_names: [],
      default_disabled_builtin_skill_ids: [],
    });
    expect(result.preferences).toEqual({
      last_skill_ids: [],
      last_disabled_builtin_skill_ids: [],
      last_mcp_ids: [],
    });
  });
});
