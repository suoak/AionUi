/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { AgentLogoMap } from '@renderer/utils/model/agentLogo';
import { resolveAgentLogo } from '@renderer/utils/model/agentLogo';
import { resolveAssistantAvatar } from '@renderer/utils/model/assistantAvatar';
import workMateLogo from '@/renderer/assets/logos/brand/app.png';
import { usesWorkMateBrand, type Assistant } from '@/common/types/agent/assistantTypes';

/** Resolve a cron assistant avatar while enforcing the current product brand. */
export function resolveCronAssistantAvatar(assistant: Assistant | undefined) {
  if (usesWorkMateBrand(assistant)) {
    return { kind: 'image', value: workMateLogo } as const;
  }
  return resolveAssistantAvatar(assistant?.avatar);
}

function normalizeAgentBackend(agent: string | undefined): string | undefined {
  if (!agent) return undefined;
  return agent.replace(/^cli:/, '').replace(/^preset:/, '');
}

function resolveCronAssistantId(config: ICronJob['metadata']['agent_config']): string | undefined {
  return config?.assistant_id;
}

/**
 * Resolve the display name and logo for a cron job's agent.
 *
 * Assistant-backed jobs display from the assistant catalog. Non-assistant
 * legacy jobs fall back to the derived runtime type.
 */
export function getJobAgentMeta(
  job: ICronJob,
  presetAssistants: Assistant[],
  logos: AgentLogoMap
): { name?: string; logo?: string | null; emoji?: string; assistantFallback?: boolean } {
  const config = job.metadata.agent_config;
  const assistantId = resolveCronAssistantId(config);
  if (assistantId) {
    const assistant = presetAssistants.find((item) => item.id === assistantId);
    if (!assistant) {
      return { name: config?.name || normalizeAgentBackend(job.metadata.agent_type), assistantFallback: true };
    }

    const rawType = normalizeAgentBackend(job.metadata.agent_type);
    const displayName = assistant.name || rawType;
    const avatar = resolveCronAssistantAvatar(assistant);
    if (avatar.kind === 'image') {
      return { name: displayName, logo: avatar.value };
    }
    if (avatar.kind === 'emoji') {
      return { name: displayName, emoji: avatar.value };
    }

    return { name: displayName, assistantFallback: true };
  }

  const rawType = normalizeAgentBackend(job.metadata.agent_type);
  if (!rawType) return {};
  const logoBackend = rawType;

  if (rawType === 'acp') {
    return {
      name: config?.name || rawType,
      logo: resolveAgentLogo(logos, { backend: logoBackend }),
    };
  }

  return {
    name: config?.name || rawType,
    logo: resolveAgentLogo(logos, { backend: logoBackend }),
  };
}
