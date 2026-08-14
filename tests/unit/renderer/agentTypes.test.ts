import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import {
  formatManagedAgentDiagnosticMessage,
  hostPreviewLimitationsFromAgent,
  managedAgentSearchText,
  shouldShowManagedPreviewLimitations,
} from '@/renderer/utils/model/agentTypes';

const t = ((key: string, options?: Record<string, unknown>) => {
  switch (key) {
    case 'settings.agentManagement.errorCodes.command_not_found':
      return `Install ${String(options?.command)} and retry the connection test.`;
    case 'settings.agentManagement.errorCodes.bridge_missing':
      return `Install ${String(options?.command)} and retry the connection test.`;
    default:
      return String(options?.defaultValue ?? key);
  }
}) as unknown as TFunction;

function managedAgent(overrides: Partial<ManagedAgent>): ManagedAgent {
  return {
    id: 'agent-1',
    name: 'Codex',
    agent_type: 'acp',
    agent_source: 'builtin',
    enabled: true,
    installed: true,
    status: 'unavailable',
    sort_order: 1,
    args: [],
    env: [],
    behavior_policy: {},
    team_capable: true,
    ...overrides,
  } as ManagedAgent;
}

describe('managedAgentSearchText', () => {
  it('matches on the CLI command so "ag" finds Antigravity via agy', () => {
    const haystack = managedAgentSearchText(
      managedAgent({ name: 'Antigravity', backend: 'antigravity', command: 'agy' }),
      'zh-CN'
    );

    expect(haystack).toContain('agy');
    expect(haystack.includes('ag')).toBe(true);
  });

  it('includes localized name, description, backend, and binary name', () => {
    const haystack = managedAgentSearchText(
      managedAgent({
        name: 'Codex',
        name_i18n: { 'zh-CN': '代码助手' },
        description: 'OpenAI coding agent',
        description_i18n: { 'zh-CN': '编码智能体' },
        backend: 'codex',
        agent_source_info: { binary_name: 'codex-cli' },
      }),
      'zh-CN'
    );

    expect(haystack).toContain('代码助手');
    expect(haystack).toContain('编码智能体');
    expect(haystack).toContain('codex-cli');
  });

  it('lowercases the haystack and skips empty fields', () => {
    const haystack = managedAgentSearchText(managedAgent({ name: 'GLM Agent', command: undefined }), 'en-US');

    expect(haystack).toBe('glm agent');
  });
});

describe('formatManagedAgentDiagnosticMessage', () => {
  it('formats localized diagnostics from error code and details', () => {
    const message = formatManagedAgentDiagnosticMessage(
      t,
      managedAgent({
        last_check_error_code: 'command_not_found',
        last_check_error_details: { command: 'codex' },
        last_check_error_message: 'spawn failed',
      })
    );

    expect(message).toBe('Install codex and retry the connection test.');
  });

  it('falls back to backend message when the code is unknown', () => {
    const message = formatManagedAgentDiagnosticMessage(
      t,
      managedAgent({
        last_check_error_code: 'unknown_error_code',
        last_check_error_message: 'raw backend message',
      })
    );

    expect(message).toBe('raw backend message');
  });
});

describe('hostPreviewLimitationsFromAgent', () => {
  it('reads connection lifetime and prompt flags from declared catalog fields', () => {
    const limits = hostPreviewLimitationsFromAgent(
      managedAgent({
        behavior_policy: { session_lifetime: 'connection_scoped' },
        team_capable: false,
        handshake: {
          agent_capabilities: { prompt_capabilities: { image: false, audio: false } },
        },
      })
    );

    expect(limits.connectionScoped).toBe(true);
    expect(limits.teamCapable).toBe(false);
    expect(limits.imagePrompt).toBe(false);
    expect(limits.audioPrompt).toBe(false);
  });

  it('does not treat a missing handshake as multimodal support', () => {
    const limits = hostPreviewLimitationsFromAgent(managedAgent({ team_capable: true }));
    expect(limits.imagePrompt).toBe(false);
    expect(limits.audioPrompt).toBe(false);
  });
});

describe('shouldShowManagedPreviewLimitations', () => {
  it('shows the preview banner for a managed runtime with declared limits', () => {
    expect(
      shouldShowManagedPreviewLimitations(
        managedAgent({
          agent_source_info: { managed_runtime: { runtime_id: 'deepseek-harness', release: '2026.08.14-1' } },
          behavior_policy: { session_lifetime: 'connection_scoped' },
          team_capable: false,
        })
      )
    ).toBe(true);
  });

  it('hides the banner when the agent is not a managed runtime', () => {
    expect(
      shouldShowManagedPreviewLimitations(
        managedAgent({
          backend: 'deepseek-harness',
          behavior_policy: { session_lifetime: 'connection_scoped' },
          team_capable: false,
        })
      )
    ).toBe(false);
  });
});
