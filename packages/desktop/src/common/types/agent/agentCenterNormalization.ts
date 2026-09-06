/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalizeLegacyBrandText } from '../../utils/utils';
import type { Assistant, AssistantDetail } from './assistantTypes';
import type { AgentCenterDetail, AgentCenterListItem } from './agentCenterTypes';

type AssistantCollectionKey =
  | 'name_i18n'
  | 'description_i18n'
  | 'enabled_skills'
  | 'custom_skill_names'
  | 'disabled_builtin_skills'
  | 'context_i18n'
  | 'prompts'
  | 'prompts_i18n'
  | 'models';

type AssistantWire = Omit<Assistant, AssistantCollectionKey> & Partial<Pick<Assistant, AssistantCollectionKey>>;

type AssistantDetailWire = Omit<
  AssistantDetail,
  'profile' | 'prompts' | 'defaults' | 'capabilities' | 'preferences'
> & {
  profile: Omit<AssistantDetail['profile'], 'name_i18n' | 'description_i18n'> &
    Partial<Pick<AssistantDetail['profile'], 'name_i18n' | 'description_i18n'>>;
  prompts: Partial<AssistantDetail['prompts']>;
  defaults: Omit<AssistantDetail['defaults'], 'skills' | 'mcps'> & {
    skills: Omit<AssistantDetail['defaults']['skills'], 'value'> &
      Partial<Pick<AssistantDetail['defaults']['skills'], 'value'>>;
    mcps: Omit<AssistantDetail['defaults']['mcps'], 'value'> &
      Partial<Pick<AssistantDetail['defaults']['mcps'], 'value'>>;
  };
  capabilities: Partial<AssistantDetail['capabilities']>;
  preferences: Omit<
    AssistantDetail['preferences'],
    'last_skill_ids' | 'last_disabled_builtin_skill_ids' | 'last_mcp_ids'
  > &
    Partial<
      Pick<AssistantDetail['preferences'], 'last_skill_ids' | 'last_disabled_builtin_skill_ids' | 'last_mcp_ids'>
    >;
};

type AgentCenterMetaWire = Omit<AgentCenterDetail['meta'], 'knowledge_scopes' | 'skill_refs' | 'role_bindings'> &
  Partial<Pick<AgentCenterDetail['meta'], 'knowledge_scopes' | 'skill_refs' | 'role_bindings'>>;

export type AgentCenterDetailWire = Omit<AgentCenterDetail, 'assistant' | 'meta'> & {
  assistant: AssistantDetailWire;
  meta: AgentCenterMetaWire;
};

export type AgentCenterListItemWire = Omit<AgentCenterListItem, 'assistant' | 'meta'> & {
  assistant: AssistantWire;
  meta: AgentCenterMetaWire;
};

const normalizeLocalizedText = (values?: Record<string, string> | null): Record<string, string> =>
  Object.fromEntries(Object.entries(values ?? {}).map(([locale, value]) => [locale, normalizeLegacyBrandText(value)]));

const normalizeLocalizedLists = (values?: Record<string, string[]> | null): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(values ?? {}).map(([locale, items]) => [locale, items.map(normalizeLegacyBrandText)])
  );

const normalizeAssistant = (assistant: AssistantWire): Assistant => ({
  ...assistant,
  name: normalizeLegacyBrandText(assistant.name),
  name_i18n: normalizeLocalizedText(assistant.name_i18n),
  description: assistant.description ? normalizeLegacyBrandText(assistant.description) : assistant.description,
  description_i18n: normalizeLocalizedText(assistant.description_i18n),
  enabled_skills: assistant.enabled_skills ?? [],
  custom_skill_names: assistant.custom_skill_names ?? [],
  disabled_builtin_skills: assistant.disabled_builtin_skills ?? [],
  context: assistant.context ? normalizeLegacyBrandText(assistant.context) : assistant.context,
  context_i18n: normalizeLocalizedText(assistant.context_i18n),
  prompts: (assistant.prompts ?? []).map(normalizeLegacyBrandText),
  prompts_i18n: normalizeLocalizedLists(assistant.prompts_i18n),
  models: assistant.models ?? [],
  agent_status_message: assistant.agent_status_message
    ? normalizeLegacyBrandText(assistant.agent_status_message)
    : assistant.agent_status_message,
  team_block_reason: assistant.team_block_reason
    ? normalizeLegacyBrandText(assistant.team_block_reason)
    : assistant.team_block_reason,
});

const normalizeAssistantDetail = (detail: AssistantDetailWire): AssistantDetail => ({
  ...detail,
  profile: {
    ...detail.profile,
    name: normalizeLegacyBrandText(detail.profile.name),
    name_i18n: normalizeLocalizedText(detail.profile.name_i18n),
    description: detail.profile.description
      ? normalizeLegacyBrandText(detail.profile.description)
      : detail.profile.description,
    description_i18n: normalizeLocalizedText(detail.profile.description_i18n),
  },
  agent_status_message: detail.agent_status_message
    ? normalizeLegacyBrandText(detail.agent_status_message)
    : detail.agent_status_message,
  team_block_reason: detail.team_block_reason
    ? normalizeLegacyBrandText(detail.team_block_reason)
    : detail.team_block_reason,
  rules: { ...detail.rules, content: normalizeLegacyBrandText(detail.rules.content) },
  prompts: {
    recommended: (detail.prompts.recommended ?? []).map(normalizeLegacyBrandText),
    recommended_i18n: normalizeLocalizedLists(detail.prompts.recommended_i18n),
  },
  defaults: {
    ...detail.defaults,
    skills: { ...detail.defaults.skills, value: detail.defaults.skills.value ?? [] },
    mcps: { ...detail.defaults.mcps, value: detail.defaults.mcps.value ?? [] },
  },
  capabilities: {
    default_skill_ids: detail.capabilities.default_skill_ids ?? [],
    custom_skill_names: detail.capabilities.custom_skill_names ?? [],
    default_disabled_builtin_skill_ids: detail.capabilities.default_disabled_builtin_skill_ids ?? [],
  },
  preferences: {
    ...detail.preferences,
    last_skill_ids: detail.preferences.last_skill_ids ?? [],
    last_disabled_builtin_skill_ids: detail.preferences.last_disabled_builtin_skill_ids ?? [],
    last_mcp_ids: detail.preferences.last_mcp_ids ?? [],
  },
});

const normalizeMeta = (meta: AgentCenterMetaWire): AgentCenterDetail['meta'] => ({
  ...meta,
  knowledge_scopes: meta.knowledge_scopes ?? [],
  skill_refs: meta.skill_refs ?? [],
  role_bindings: meta.role_bindings ?? [],
});

/** Normalize collections omitted by Core when they are empty. */
export const normalizeAgentCenterDetail = (detail: AgentCenterDetailWire): AgentCenterDetail => ({
  ...detail,
  assistant: normalizeAssistantDetail(detail.assistant),
  meta: normalizeMeta(detail.meta),
});

/** Normalize list rows using the same sparse-wire contract as detail responses. */
export const normalizeAgentCenterListItem = (item: AgentCenterListItemWire): AgentCenterListItem => ({
  ...item,
  assistant: normalizeAssistant(item.assistant),
  meta: normalizeMeta(item.meta),
});
