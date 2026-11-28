import { Button, Input, Message, Select, Tag, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type {
  AgentCenterDetail,
  AgentMcpPolicy,
  AgentVisibility,
  AgentWorkflowNodeDefinition,
  AgentWorkflowOutputFieldDefinition,
  AgentWorkflowOutputFormat,
  CreateAgentCenterRequest,
} from '@/common/types/agent/agentCenterTypes';
import {
  createAgentWorkflow,
  createDefaultWorkflowNodes,
  getAgentPublishReadiness,
  hasValidWorkflowOutputSchema,
} from '@/common/types/agent/agentWorkflow';
import type { AgentWorkflowTemplate } from '@/common/types/agent/agentWorkflowTemplates';
import { WorkMateInlineSearchInput, WorkMateSteps } from '@renderer/components/base';
import { DROPDOWN_SEARCH_THRESHOLD } from '@renderer/components/agent/runtimeSelectorOptions';
import { useManagedAgentRuntimeCatalog } from '@renderer/hooks/agent/useManagedAgents';
import { useModelProviderList } from '@renderer/hooks/agent/useModelProviderList';
import { ensureBackendMcpCatalog } from '@renderer/hooks/mcp/catalog';
import {
  buildAssistantEditorBackends,
  filterAssistantEditorBackends,
} from '@renderer/pages/settings/AssistantSettings/assistantUtils';
import {
  buildAgentRuntimeModeState,
  buildAgentRuntimeModelInfo,
  buildAgentRuntimeThoughtLevelOption,
} from '@renderer/utils/model/agentRuntimeCatalog';
import { formatAgentCenterError } from './agentCenterErrors';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import CapabilityDefaultsFields from './CapabilityDefaultsFields';
import CapabilityTogglePicker from './CapabilityTogglePicker';
import ConversationStartersFields from './ConversationStartersFields';
import AgentWorkflowDefinitionFields from './AgentWorkflowDefinitionFields';
import AgentWorkflowTemplatePicker from './AgentWorkflowTemplatePicker';
import { INHERIT_MCP_COPY_KEYS } from './mcpPolicyCopy';

const { Title, Text } = Typography;

/**
 * ChatGPT-inspired agent workflow (WorkMate voice, not UI clone):
 * 创建 → 指令与个性 → 能力配置 → 试跑预览 → 发布与共享
 * KnowHub / knowledge_scopes intentionally omitted from the primary flow.
 */
const STEP_KEYS = ['basic', 'instructions', 'capabilities', 'workflow', 'preview', 'publish'] as const;

type SkillOption = {
  name: string;
  description: string;
};

const AgentCenterWizardPage: React.FC<{ mode: 'create' | 'edit' }> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const localeKey = i18n.language;
  const visibilityLabel: Record<AgentVisibility, string> = {
    private: t('agent.agentCenter.wizard.visibility.private'),
    team: t('agent.agentCenter.list.visibility.team'),
    enterprise: t('agent.agentCenter.list.visibility.enterprise'),
  };
  const stepTitles = useMemo(() => STEP_KEYS.map((key) => t(`agent.agentCenter.builder.steps.${key}`)), [t]);
  const [message, messageContext] = Message.useMessage({ maxCount: 5 });
  const messageRef = useRef(message);
  messageRef.current = message;
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [trying, setTrying] = useState(false);
  const [agentId, setAgentId] = useState(id ?? '');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft');
  const [version, setVersion] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<AgentVisibility>('private');
  const [instructions, setInstructions] = useState('');
  const [recommendedPrompts, setRecommendedPrompts] = useState<string[]>([]);
  const [selectedSkillKeys, setSelectedSkillKeys] = useState<string[]>([]);
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([]);
  const [mcpPolicy, setMcpPolicy] = useState<AgentMcpPolicy>('allowlist');
  const [engineAgentId, setEngineAgentId] = useState('');
  const [defaultModelMode, setDefaultModelMode] = useState<'auto' | 'fixed'>('auto');
  const [defaultModelValue, setDefaultModelValue] = useState('');
  const [defaultPermissionMode, setDefaultPermissionMode] = useState<'auto' | 'fixed'>('auto');
  const [defaultPermissionValue, setDefaultPermissionValue] = useState('');
  const [defaultThoughtLevelMode, setDefaultThoughtLevelMode] = useState<'auto' | 'fixed'>('auto');
  const [defaultThoughtLevelValue, setDefaultThoughtLevelValue] = useState('');
  const [changelog, setChangelog] = useState('');
  const [workflowInputPlaceholder, setWorkflowInputPlaceholder] = useState('');
  const [workflowOutputFormat, setWorkflowOutputFormat] = useState<AgentWorkflowOutputFormat>('markdown');
  const [workflowOutputSchema, setWorkflowOutputSchema] = useState<AgentWorkflowOutputFieldDefinition[]>([]);
  const [workflowNodes, setWorkflowNodes] = useState<AgentWorkflowNodeDefinition[]>(createDefaultWorkflowNodes);
  const [skillOptions, setSkillOptions] = useState<SkillOption[]>([]);
  const [mcpOptions, setMcpOptions] = useState<Array<{ id: string; name: string; description?: string }>>([]);
  // C-06: distinguish "no servers configured" from "catalog failed to load".
  const [mcpCatalogFailed, setMcpCatalogFailed] = useState(false);
  const [agentQuery, setAgentQuery] = useState('');

  useEffect(() => {
    const focusStep = (location.state as { focusStep?: number } | null)?.focusStep;
    if (typeof focusStep === 'number' && focusStep >= 0 && focusStep < STEP_KEYS.length) {
      setStep(focusStep);
    }
  }, [location.state]);

  // Prefer the same backend-agent catalog as Settings → Assistants engine picker.
  const managedAgentRuntimeCatalog = useManagedAgentRuntimeCatalog();
  const { providers, getAvailableModels } = useModelProviderList();
  const availableBackends = useMemo(
    () => buildAssistantEditorBackends(managedAgentRuntimeCatalog, localeKey, engineAgentId),
    [managedAgentRuntimeCatalog, localeKey, engineAgentId]
  );
  const showAgentSearch = availableBackends.length > DROPDOWN_SEARCH_THRESHOLD;
  const filteredBackends = useMemo(
    () => filterAssistantEditorBackends(availableBackends, agentQuery),
    [availableBackends, agentQuery]
  );

  const currentBackend = useMemo(
    () => availableBackends.find((option) => option.id === engineAgentId),
    [availableBackends, engineAgentId]
  );
  const editAgentRuntimeKey = currentBackend?.runtimeKey || (engineAgentId ? '' : 'aionrs');

  const currentAgentRuntimeCatalog = useMemo(() => {
    if (engineAgentId) {
      return managedAgentRuntimeCatalog.find((agent) => agent.id === engineAgentId) ?? null;
    }
    // Empty engine = product default (aionrs / CSBU WorkMate).
    return managedAgentRuntimeCatalog.find((agent) => (agent.backend || agent.agent_type) === 'aionrs') ?? null;
  }, [engineAgentId, managedAgentRuntimeCatalog]);

  const providerModelOptions = useMemo(
    () =>
      providers.flatMap((provider) =>
        getAvailableModels(provider).map((modelName) => ({
          key: `${provider.id}-${modelName}`,
          value: modelName,
          label: `${provider.name || provider.id} · ${modelName}`,
        }))
      ),
    [getAvailableModels, providers]
  );

  const currentAgentRuntimeModelInfo = useMemo(
    () => buildAgentRuntimeModelInfo(currentAgentRuntimeCatalog),
    [currentAgentRuntimeCatalog]
  );

  const modelOptions = useMemo(() => {
    if (editAgentRuntimeKey === 'aionrs') {
      return providerModelOptions;
    }
    if (currentAgentRuntimeModelInfo && currentAgentRuntimeModelInfo.available_models.length > 0) {
      return currentAgentRuntimeModelInfo.available_models.map((model) => ({
        key: `${engineAgentId}-${model.id}`,
        value: model.id,
        label: model.label,
        description: model.description,
      }));
    }
    if (currentBackend && currentBackend.modelOptions.length > 0) {
      return currentBackend.modelOptions.map((model) => ({
        key: `${engineAgentId}-${model.value}`,
        value: model.value,
        label: model.label,
        description: model.description,
      }));
    }
    return [];
  }, [currentAgentRuntimeModelInfo, currentBackend, editAgentRuntimeKey, engineAgentId, providerModelOptions]);

  const permissionOptions = useMemo(
    () =>
      buildAgentRuntimeModeState(currentAgentRuntimeCatalog).options.map((option) => ({
        value: option.value,
        label: option.label,
        description: option.description,
      })),
    [currentAgentRuntimeCatalog]
  );

  const thoughtLevelOption = useMemo(
    () => buildAgentRuntimeThoughtLevelOption(currentAgentRuntimeCatalog),
    [currentAgentRuntimeCatalog]
  );
  const thoughtLevelOptions = thoughtLevelOption?.options ?? [];

  // Drop fixed values that disappeared after engine / provider catalog change.
  useEffect(() => {
    if (
      defaultModelMode === 'fixed' &&
      defaultModelValue &&
      modelOptions.length > 0 &&
      !modelOptions.some((option) => option.value === defaultModelValue)
    ) {
      setDefaultModelMode('auto');
      setDefaultModelValue('');
    }
  }, [defaultModelMode, defaultModelValue, modelOptions]);

  useEffect(() => {
    if (
      defaultPermissionMode === 'fixed' &&
      defaultPermissionValue &&
      permissionOptions.length > 0 &&
      !permissionOptions.some((option) => option.value === defaultPermissionValue)
    ) {
      setDefaultPermissionMode('auto');
      setDefaultPermissionValue('');
    }
  }, [defaultPermissionMode, defaultPermissionValue, permissionOptions]);

  useEffect(() => {
    if (
      defaultThoughtLevelMode === 'fixed' &&
      defaultThoughtLevelValue &&
      thoughtLevelOptions.length > 0 &&
      !thoughtLevelOptions.some((option) => option.value === defaultThoughtLevelValue)
    ) {
      setDefaultThoughtLevelMode('auto');
      setDefaultThoughtLevelValue('');
    }
  }, [defaultThoughtLevelMode, defaultThoughtLevelValue, thoughtLevelOptions]);

  useEffect(() => {
    void (async () => {
      try {
        const [skillsList, { allServers }] = await Promise.all([
          ipcBridge.fs.listAvailableSkills.invoke(),
          ensureBackendMcpCatalog(),
        ]);
        setSkillOptions(
          skillsList.map((s) => ({
            name: s.name,
            description: s.description || '',
          }))
        );
        setMcpOptions(
          allServers.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
          }))
        );
      } catch (error) {
        console.error(error);
        setSkillOptions([]);
        setMcpOptions([]);
        setMcpCatalogFailed(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    void (async () => {
      try {
        const detail: AgentCenterDetail = await ipcBridge.agentCenter.get.invoke({ id });
        setAgentId(detail.assistant.id);
        setName(detail.assistant.profile.name);
        setDescription(detail.assistant.profile.description ?? '');
        setVisibility(detail.meta.visibility);
        setInstructions(detail.assistant.rules.content ?? '');
        setRecommendedPrompts(detail.assistant.prompts?.recommended ?? []);
        setSelectedSkillKeys(detail.meta.skill_refs.map((s) => s.skill_key));
        setSelectedMcpIds(detail.assistant.defaults.mcps.value ?? []);
        setMcpPolicy(detail.meta.mcp_policy);
        setEngineAgentId(detail.assistant.engine.agent_id);
        setDefaultModelMode(detail.assistant.defaults.model.mode === 'fixed' ? 'fixed' : 'auto');
        setDefaultModelValue(detail.assistant.defaults.model.value || '');
        setDefaultPermissionMode(detail.assistant.defaults.permission.mode === 'fixed' ? 'fixed' : 'auto');
        setDefaultPermissionValue(detail.assistant.defaults.permission.value || '');
        setDefaultThoughtLevelMode(detail.assistant.defaults.thought_level.mode === 'fixed' ? 'fixed' : 'auto');
        setDefaultThoughtLevelValue(detail.assistant.defaults.thought_level.value || '');
        setStatus(detail.meta.status);
        setVersion(detail.meta.version);
        setWorkflowInputPlaceholder(detail.meta.workflow.input.placeholder ?? '');
        setWorkflowOutputFormat(detail.meta.workflow.output.format);
        setWorkflowOutputSchema(detail.meta.workflow.output.schema ?? []);
        setWorkflowNodes(detail.meta.workflow.nodes);
      } catch (error) {
        console.error(error);
        messageRef.current.error(formatAgentCenterError(error, t('agent.agentCenter.wizard.loadFailed')));
      }
    })();
  }, [mode, id]);

  const skillRefs = useMemo(
    () => selectedSkillKeys.map((skill_key) => ({ skill_key, version_policy: 'pin' as const })),
    [selectedSkillKeys]
  );

  const skillToggleItems = useMemo(
    () =>
      skillOptions.map((s) => ({
        id: s.name,
        name: s.name,
        description: s.description || undefined,
      })),
    [skillOptions]
  );

  const mcpToggleItems = useMemo(
    () =>
      mcpOptions.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
      })),
    [mcpOptions]
  );

  // Keep previously saved ids visible even if they left the catalog.
  const skillToggleItemsWithOrphans = useMemo(() => {
    const known = new Set(skillToggleItems.map((i) => i.id));
    const orphans = selectedSkillKeys
      .filter((key) => !known.has(key))
      .map((key) => ({ id: key, name: key, description: t('agent.agentCenter.wizard.notInstalled') }));
    return [...orphans, ...skillToggleItems];
  }, [skillToggleItems, selectedSkillKeys]);

  const mcpToggleItemsWithOrphans = useMemo(() => {
    const known = new Set(mcpToggleItems.map((i) => i.id));
    const orphans = selectedMcpIds
      .filter((mcpId) => !known.has(mcpId))
      .map((mcpId) => ({ id: mcpId, name: mcpId, description: t('agent.agentCenter.wizard.notFoundInEnv') }));
    return [...orphans, ...mcpToggleItems];
  }, [mcpToggleItems, selectedMcpIds]);

  const persistRules = useCallback(async (assistantId: string, rules: string) => {
    const trimmed = rules.trim();
    if (trimmed) {
      await ipcBridge.fs.writeAssistantRule.invoke({
        assistant_id: assistantId,
        content: rules,
      });
      return;
    }
    await ipcBridge.fs.deleteAssistantRule.invoke({ assistant_id: assistantId });
  }, []);

  const buildMeta = useCallback(
    () => ({
      visibility,
      mcp_policy: mcpPolicy,
      skill_refs: skillRefs,
      workflow: createAgentWorkflow(
        workflowInputPlaceholder,
        workflowOutputFormat,
        workflowNodes,
        workflowOutputSchema
      ),
      mcp_ids: mcpPolicy === 'allowlist' ? selectedMcpIds : undefined,
      // KnowHub stays out of primary UX; API field remains optional and empty.
    }),
    [
      visibility,
      mcpPolicy,
      skillRefs,
      selectedMcpIds,
      workflowInputPlaceholder,
      workflowOutputFormat,
      workflowOutputSchema,
      workflowNodes,
    ]
  );

  const buildAssistantDefaults = useCallback((): NonNullable<CreateAgentCenterRequest['defaults']> => {
    return {
      model: defaultModelMode === 'fixed' ? { mode: 'fixed', value: defaultModelValue.trim() } : { mode: 'auto' },
      permission:
        defaultPermissionMode === 'fixed' ? { mode: 'fixed', value: defaultPermissionValue.trim() } : { mode: 'auto' },
      thought_level:
        defaultThoughtLevelMode === 'fixed'
          ? { mode: 'fixed', value: defaultThoughtLevelValue.trim() }
          : { mode: 'auto' },
      mcps: { mode: mcpPolicy === 'allowlist' ? 'fixed' : 'auto', value: selectedMcpIds },
      skills: { mode: 'fixed', value: skillRefs.map((s) => s.skill_key) },
    };
  }, [
    defaultModelMode,
    defaultModelValue,
    defaultPermissionMode,
    defaultPermissionValue,
    defaultThoughtLevelMode,
    defaultThoughtLevelValue,
    mcpPolicy,
    selectedMcpIds,
    skillRefs,
  ]);

  const persist = async (opts: { publish: boolean; stay?: boolean }): Promise<string | null> => {
    if (!name.trim()) {
      messageRef.current.warning(t('agent.agentCenter.wizard.nameRequired'));
      setStep(0);
      return null;
    }
    if (!hasValidWorkflowOutputSchema(workflowOutputFormat, workflowOutputSchema)) {
      messageRef.current.warning(t('agent.agentCenter.builder.readiness.outputMissing'));
      setStep(3);
      return null;
    }
    if (defaultModelMode === 'fixed' && !defaultModelValue.trim()) {
      messageRef.current.warning(t('agent.agentCenter.wizard.fixedModelRequired'));
      setStep(2);
      return null;
    }
    if (defaultPermissionMode === 'fixed' && !defaultPermissionValue.trim()) {
      messageRef.current.warning(t('agent.agentCenter.wizard.fixedPermissionRequired'));
      setStep(2);
      return null;
    }
    if (defaultThoughtLevelMode === 'fixed' && !defaultThoughtLevelValue.trim()) {
      messageRef.current.warning(t('agent.agentCenter.wizard.fixedThoughtRequired'));
      setStep(2);
      return null;
    }
    if (opts.publish) {
      const firstMissing = getAgentPublishReadiness({
        name,
        instructions,
        inputPlaceholder: workflowInputPlaceholder,
        nodes: workflowNodes,
        outputFormat: workflowOutputFormat,
        outputSchema: workflowOutputSchema,
        allowedToolIds: mcpPolicy === 'allowlist' ? selectedMcpIds : undefined,
      }).find((item) => !item.ready);
      if (firstMissing) {
        const targetStep = firstMissing.key === 'name' ? 0 : firstMissing.key === 'instructions' ? 1 : 3;
        setStep(targetStep);
        messageRef.current.warning(t(`agent.agentCenter.builder.readiness.${firstMissing.key}Missing`));
        return null;
      }
    }
    setSaving(true);
    try {
      const meta = buildMeta();
      let currentId = agentId;
      if (mode === 'create' && !currentId) {
        const body: CreateAgentCenterRequest = {
          name: name.trim(),
          description: description.trim() || undefined,
          agent_id: engineAgentId.trim() || undefined,
          enabled_skills: skillRefs.map((s) => s.skill_key),
          recommended_prompts: recommendedPrompts,
          defaults: buildAssistantDefaults(),
          meta,
        };
        const created = await ipcBridge.agentCenter.create.invoke(body);
        currentId = created.assistant.id;
        setAgentId(currentId);
        setStatus(created.meta.status);
        setVersion(created.meta.version);
      } else {
        const updated = await ipcBridge.agentCenter.update.invoke({
          id: currentId,
          name: name.trim(),
          description: description.trim() || undefined,
          agent_id: engineAgentId.trim() || undefined,
          enabled_skills: skillRefs.map((s) => s.skill_key),
          recommended_prompts: recommendedPrompts,
          defaults: buildAssistantDefaults(),
          meta,
        });
        setStatus(updated.meta.status);
        setVersion(updated.meta.version);
      }

      if (currentId) {
        await persistRules(currentId, instructions);
      }

      if (opts.publish && currentId) {
        const published = await ipcBridge.agentCenter.publish.invoke({
          id: currentId,
          pin_skills_on_publish: true,
          changelog: changelog.trim() || undefined,
        });
        setStatus(published.meta.status);
        setVersion(published.meta.version);
        messageRef.current.success(t('agent.agentCenter.list.publishedToast', { version: published.meta.version }));
      } else if (!opts.stay) {
        messageRef.current.success(t('agent.agentCenter.wizard.draftSaved'));
      }

      if (!opts.stay) {
        navigate('/agents');
      }
      return currentId;
    } catch (error) {
      console.error(error);
      messageRef.current.error(
        formatAgentCenterError(
          error,
          opts.publish ? t('agent.agentCenter.list.publishFailed') : t('agent.agentCenter.wizard.saveFailed')
        )
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleTryRun = async () => {
    setTrying(true);
    try {
      const currentId = await persist({ publish: false, stay: true });
      if (!currentId) return;
      const plan = await ipcBridge.agentCenter.run.invoke({ id: currentId });
      const previewHint =
        plan.preview_mode === 'published'
          ? t('agent.agentCenter.wizard.previewPublished', { revision: plan.revision || version })
          : t('agent.agentCenter.wizard.previewDraft');
      messageRef.current.success(t('agent.agentCenter.wizard.openingPreview', { hint: previewHint }));
      navigate('/guid', {
        state: {
          selectedAssistantId: plan.assistant_id,
          agentCenterRunPlan: plan.create_conversation,
          agentCenterPreviewMode: plan.preview_mode,
          prefillPrompt: '',
          focusPrefill: true,
        },
      });
    } catch (error) {
      console.error(error);
      messageRef.current.error(formatAgentCenterError(error, t('agent.agentCenter.wizard.tryRunFailed')));
    } finally {
      setTrying(false);
    }
  };

  const engineLabel = useMemo(() => {
    const selected = availableBackends.find((b) => b.id === engineAgentId);
    return selected?.name || engineAgentId || t('agent.agentCenter.wizard.defaultEngine');
  }, [availableBackends, engineAgentId]);

  const publishReadiness = useMemo(
    () =>
      getAgentPublishReadiness({
        name,
        instructions,
        inputPlaceholder: workflowInputPlaceholder,
        nodes: workflowNodes,
        outputFormat: workflowOutputFormat,
        outputSchema: workflowOutputSchema,
        allowedToolIds: mcpPolicy === 'allowlist' ? selectedMcpIds : undefined,
      }),
    [
      name,
      instructions,
      workflowInputPlaceholder,
      workflowNodes,
      workflowOutputFormat,
      workflowOutputSchema,
      mcpPolicy,
      selectedMcpIds,
    ]
  );

  const handleTemplateSelect = (template: AgentWorkflowTemplate) => {
    setName(template.name);
    setDescription(template.description);
    setInstructions(template.instructions);
    setRecommendedPrompts(template.starters);
    setWorkflowInputPlaceholder(template.inputPlaceholder);
    setWorkflowOutputFormat(template.outputFormat);
    setWorkflowOutputSchema([]);
    setWorkflowNodes(createDefaultWorkflowNodes());
    messageRef.current.success(t('agent.agentCenter.templates.applied', { name: template.name }));
  };

  return (
    <div className='h-full overflow-auto p-24px max-w-720px'>
      {messageContext}
      <Button type='text' className='!px-0 mb-8px' onClick={() => navigate('/agents')}>
        ← {t('agent.agentCenter.wizard.back')}
      </Button>
      <Title heading={4} className='!mb-4px'>
        {mode === 'create' ? t('agent.agentCenter.wizard.createTitle') : t('agent.agentCenter.wizard.editTitle')}
      </Title>
      <Text type='secondary' className='mb-16px block'>
        {t('agent.agentCenter.wizard.intro')}
      </Text>

      <WorkMateSteps current={step} className='mb-8px' size='small'>
        {stepTitles.map((title) => (
          <WorkMateSteps.Step key={title} title={title} />
        ))}
      </WorkMateSteps>
      <Text type='secondary' className='text-12px mb-16px block'>
        {t('agent.agentCenter.builder.stepProgress', {
          current: step + 1,
          total: STEP_KEYS.length,
          title: stepTitles[step],
        })}
        {status === 'published'
          ? t('agent.agentCenter.wizard.publishedSuffix', { version })
          : t('agent.agentCenter.wizard.draftSuffix')}
      </Text>

      {step === 0 && (
        <div className='flex flex-col gap-12px'>
          {mode === 'create' ? <AgentWorkflowTemplatePicker onSelect={handleTemplateSelect} /> : null}
          <Text type='secondary'>{t('agent.agentCenter.wizard.basicHint')}</Text>
          <label>
            <Text>{t('agent.agentCenter.wizard.name')}</Text>
            <Input value={name} onChange={setName} placeholder={t('agent.agentCenter.wizard.namePlaceholder')} />
          </label>
          <label>
            <Text>{t('agent.agentCenter.wizard.summary')}</Text>
            <Input.TextArea
              value={description}
              onChange={setDescription}
              placeholder={t('agent.agentCenter.wizard.summaryPlaceholder')}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </label>
        </div>
      )}

      {step === 1 && (
        <div className='flex flex-col gap-16px'>
          <Text type='secondary'>{t('agent.agentCenter.wizard.instructionsHint')}</Text>
          <Input.TextArea
            value={instructions}
            onChange={setInstructions}
            placeholder={t('agent.agentCenter.wizard.instructionsPlaceholder')}
            autoSize={{ minRows: 8, maxRows: 18 }}
          />
          <ConversationStartersFields items={recommendedPrompts} onChange={setRecommendedPrompts} />
        </div>
      )}

      {step === 2 && (
        <div className='flex flex-col gap-16px'>
          <div className='flex flex-col gap-8px'>
            <Text bold>{t('agent.agentCenter.wizard.engineLabel')}</Text>
            <Text type='secondary'>{t('agent.agentCenter.wizard.engineHint')}</Text>
            <Select
              allowClear
              placeholder={t('agent.agentCenter.wizard.enginePlaceholder')}
              value={engineAgentId || undefined}
              onChange={(v) => setEngineAgentId((v as string) || '')}
              onVisibleChange={(visible) => {
                if (!visible) setAgentQuery('');
              }}
              dropdownRender={(menu) =>
                showAgentSearch ? (
                  <div>
                    <div className='px-6px pt-4px pb-6px' style={{ background: 'var(--color-bg-popup)' }}>
                      <WorkMateInlineSearchInput
                        value={agentQuery}
                        onChange={setAgentQuery}
                        placeholder={t('agent.agentCenter.wizard.engineSearch')}
                        data-testid='agent-center-engine-search'
                      />
                    </div>
                    {menu}
                  </div>
                ) : (
                  menu
                )
              }
              notFoundContent={
                <div className='px-12px py-10px text-12px text-t-tertiary text-center'>
                  {t('agent.agentCenter.wizard.engineEmpty')}
                </div>
              }
              renderFormat={(_option, value) => {
                const selected = availableBackends.find((item) => item.id === value);
                return selected?.name || (value as string) || '';
              }}
              data-testid='agent-center-engine-select'
            >
              {filteredBackends.map((option) => (
                <Select.Option key={option.id} value={option.id}>
                  <span className='truncate'>{option.name}</span>
                </Select.Option>
              ))}
            </Select>
          </div>
          <CapabilityDefaultsFields
            localeKey={localeKey}
            modelMode={defaultModelMode}
            setModelMode={setDefaultModelMode}
            modelValue={defaultModelValue}
            setModelValue={setDefaultModelValue}
            modelOptions={modelOptions}
            permissionMode={defaultPermissionMode}
            setPermissionMode={setDefaultPermissionMode}
            permissionValue={defaultPermissionValue}
            setPermissionValue={setDefaultPermissionValue}
            permissionOptions={permissionOptions}
            showThoughtLevel={thoughtLevelOption !== null}
            thoughtLevelMode={defaultThoughtLevelMode}
            setThoughtLevelMode={setDefaultThoughtLevelMode}
            thoughtLevelValue={defaultThoughtLevelValue}
            setThoughtLevelValue={setDefaultThoughtLevelValue}
            thoughtLevelOptions={thoughtLevelOptions}
          />
          <div className='flex flex-col gap-8px'>
            <Text bold>Skills</Text>
            <Text type='secondary'>{t('agent.agentCenter.wizard.skillsHint')}</Text>
            <CapabilityTogglePicker
              items={skillToggleItemsWithOrphans}
              value={selectedSkillKeys}
              onChange={setSelectedSkillKeys}
              searchPlaceholder={t('agent.agentCenter.wizard.skillsSearch')}
              emptyText={
                skillOptions.length === 0
                  ? t('agent.agentCenter.wizard.skillsEmptyNone')
                  : t('agent.agentCenter.wizard.skillsEmptyMatch')
              }
              testId='agent-center-skills-picker'
            />
          </div>
          <div className='flex flex-col gap-8px'>
            <Text bold>{t('agent.agentCenter.wizard.mcpLabel')}</Text>
            <Text type='secondary'>{t('agent.agentCenter.wizard.mcpHint')}</Text>
            <Select value={mcpPolicy} onChange={(v) => setMcpPolicy(v as AgentMcpPolicy)}>
              <Select.Option value='allowlist'>{t('agent.agentCenter.wizard.mcpAllowlistOption')}</Select.Option>
              <Select.Option value='inherit_user_enabled'>{t(INHERIT_MCP_COPY_KEYS.option)}</Select.Option>
            </Select>
            {mcpPolicy === 'allowlist' && (
              <CapabilityTogglePicker
                items={mcpToggleItemsWithOrphans}
                value={selectedMcpIds}
                onChange={setSelectedMcpIds}
                searchPlaceholder={t('agent.agentCenter.wizard.mcpSearch')}
                emptyText={
                  mcpCatalogFailed
                    ? t('agent.agentCenter.wizard.mcpLoadFailed')
                    : mcpOptions.length === 0
                      ? t('agent.agentCenter.wizard.mcpEmptyNone')
                      : t('agent.agentCenter.wizard.mcpEmptyMatch')
                }
                footerHint={t('agent.agentCenter.wizard.mcpFooterHint')}
                testId='agent-center-mcp-picker'
              />
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <AgentWorkflowDefinitionFields
          inputPlaceholder={workflowInputPlaceholder}
          onInputPlaceholderChange={setWorkflowInputPlaceholder}
          outputFormat={workflowOutputFormat}
          onOutputFormatChange={setWorkflowOutputFormat}
          outputSchema={workflowOutputSchema}
          onOutputSchemaChange={setWorkflowOutputSchema}
          nodes={workflowNodes}
          onNodesChange={setWorkflowNodes}
          toolOptions={
            mcpPolicy === 'inherit_user_enabled'
              ? mcpToggleItemsWithOrphans
              : mcpToggleItemsWithOrphans.filter((tool) => selectedMcpIds.includes(tool.id))
          }
        />
      )}

      {step === 4 && (
        <div className='flex flex-col gap-12px'>
          <Text type='secondary'>{t('agent.agentCenter.wizard.previewHint')}</Text>
          <div className='rounded-8px border border-[var(--color-border-2)] p-16px flex flex-col gap-6px'>
            <Text bold>{name || t('agent.agentCenter.wizard.unnamed')}</Text>
            <Text type='secondary' className='text-12px'>
              {status === 'published'
                ? t('agent.agentCenter.wizard.publishedVersion', { version })
                : t('agent.agentCenter.list.status.draft')}
              {t('agent.agentCenter.wizard.engineLine', { engine: engineLabel })}
              {t('agent.agentCenter.wizard.modelPrefix')}
              {defaultModelMode === 'fixed' && defaultModelValue
                ? defaultModelValue
                : t('agent.agentCenter.wizard.auto')}
              {t('agent.agentCenter.wizard.permissionPrefix')}
              {defaultPermissionMode === 'fixed' && defaultPermissionValue
                ? defaultPermissionValue
                : t('agent.agentCenter.wizard.auto')}
              {thoughtLevelOption
                ? t('agent.agentCenter.wizard.thoughtLine', {
                    value:
                      defaultThoughtLevelMode === 'fixed' && defaultThoughtLevelValue
                        ? defaultThoughtLevelValue
                        : t('agent.agentCenter.wizard.auto'),
                  })
                : ''}
              {' · Skills '}
              {skillRefs.length} · MCP{' '}
              {mcpPolicy === 'allowlist'
                ? t('agent.agentCenter.wizard.allowlistCount', { count: selectedMcpIds.length })
                : t(INHERIT_MCP_COPY_KEYS.short)}
            </Text>
            {description ? <Text className='text-13px'>{description}</Text> : null}
            {instructions.trim() ? (
              <Text type='secondary' className='text-12px line-clamp-4 whitespace-pre-wrap'>
                {instructions.trim()}
              </Text>
            ) : (
              <Text type='secondary' className='text-12px'>
                {t('agent.agentCenter.wizard.noInstructions')}
              </Text>
            )}
            {recommendedPrompts.length > 0 ? (
              <div className='mt-8px flex flex-col gap-4px'>
                <Text bold className='text-12px'>
                  {t('agent.agentCenter.wizard.startersCount', { count: recommendedPrompts.length })}
                </Text>
                <ul className='m-0 pl-18px text-12px text-t-secondary'>
                  {recommendedPrompts.map((prompt, index) => (
                    <li key={`${prompt}-${index}`} className='leading-18px'>
                      {prompt}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <Text type='secondary' className='text-12px mt-4px'>
                {t('agent.agentCenter.wizard.noStarters')}
              </Text>
            )}
          </div>
          <Button type='primary' loading={trying || saving} onClick={() => void handleTryRun()}>
            {t('agent.agentCenter.wizard.tryConversation')}
          </Button>
          {agentId ? (
            <div className='rounded-8px bg-[var(--color-fill-1)] p-12px flex flex-col gap-8px mt-4px'>
              <Text bold className='text-12px'>
                {t('agent.agentCenter.wizard.afterTry')}
              </Text>
              <Text type='secondary' className='text-12px'>
                {t('agent.agentCenter.tryRunImprovementDescription')}
              </Text>
              <div className='flex flex-wrap gap-8px'>
                <Button size='mini' onClick={() => setStep(1)}>
                  {t('agent.agentCenter.wizard.improveInstructions')}
                </Button>
                <Button size='mini' onClick={() => setStep(5)}>
                  {t('agent.agentCenter.wizard.goPublish')}
                </Button>
                <Button size='mini' type='text' onClick={() => navigate(`/agents/${agentId}`)}>
                  {t('agent.agentCenter.wizard.openDetail')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {step === 5 && (
        <div className='flex flex-col gap-12px'>
          <Text type='secondary'>{t('agent.agentCenter.wizard.publishHint')}</Text>
          <label>
            <Text>{t('agent.agentCenter.wizard.visibilityLabel')}</Text>
            <Select value={visibility} onChange={(v) => setVisibility(v as AgentVisibility)}>
              <Select.Option value='private'>{t('agent.agentCenter.wizard.visibility.private')}</Select.Option>
              <Select.Option value='team'>{t('agent.agentCenter.list.visibility.team')}</Select.Option>
              <Select.Option value='enterprise' disabled>
                {t('agent.agentCenter.wizard.visibility.enterpriseSoon')}
              </Select.Option>
            </Select>
          </label>
          <div className='rounded-8px border border-[var(--color-border-2)] p-12px'>
            <Text bold className='text-12px block mb-8px'>
              {t('agent.agentCenter.builder.readiness.title')}
            </Text>
            <div className='flex flex-col gap-6px'>
              {publishReadiness.map((item) => (
                <div key={item.key} className='flex items-center justify-between gap-8px'>
                  <Text className='text-12px'>{t(`agent.agentCenter.builder.readiness.${item.key}`)}</Text>
                  <Tag size='small' color={item.ready ? 'green' : 'orange'}>
                    {item.ready
                      ? t('agent.agentCenter.builder.readiness.ready')
                      : t('agent.agentCenter.builder.readiness.missing')}
                  </Tag>
                </div>
              ))}
            </div>
          </div>
          <label>
            <Text>{t('agent.agentCenter.wizard.changelog')}</Text>
            <Input.TextArea
              value={changelog}
              onChange={setChangelog}
              placeholder={t('agent.agentCenter.wizard.changelogPlaceholder')}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </label>
          <div className='rounded-8px border border-[var(--color-border-2)] p-12px sticky bottom-0 bg-[var(--color-bg-2)]'>
            <Text bold className='text-12px block mb-6px'>
              {t('agent.agentCenter.wizard.publishSummary')}
            </Text>
            <Text type='secondary' className='text-12px block'>
              {name || t('agent.agentCenter.wizard.unnamed')} · {visibilityLabel[visibility]}
              {version > 0
                ? t('agent.agentCenter.wizard.versionBump', { current: version, next: version + 1 })
                : t('agent.agentCenter.wizard.firstPublish')}
            </Text>
            <Text type='secondary' className='text-12px block mt-4px'>
              {t('agent.agentCenter.wizard.pinSkills', {
                list: skillRefs.length
                  ? skillRefs.map((sk) => sk.skill_key).join(t('agent.agentCenter.wizard.listSep'))
                  : t('agent.agentCenter.wizard.none'),
              })}
            </Text>
            <Text type='secondary' className='text-12px block'>
              MCP：
              {mcpPolicy === 'allowlist'
                ? selectedMcpIds.length
                  ? t('agent.agentCenter.wizard.allowlistItems', { count: selectedMcpIds.length })
                  : t('agent.agentCenter.wizard.allowlistEmptyMeans')
                : t(INHERIT_MCP_COPY_KEYS.option)}
              {t('agent.agentCenter.wizard.enginePrefix')}
              {engineLabel}
            </Text>
            {changelog.trim() ? (
              <Text type='secondary' className='text-12px block mt-4px'>
                {t('agent.agentCenter.wizard.changelogLine', { text: changelog.trim() })}
              </Text>
            ) : null}
          </div>
        </div>
      )}

      <div className='flex justify-between mt-24px'>
        <Button disabled={step === 0 || saving || trying} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          {t('agent.agentCenter.wizard.previous')}
        </Button>
        <div className='flex gap-8px'>
          {step < STEP_KEYS.length - 1 ? (
            <>
              {step === 4 && (
                <Button loading={saving} onClick={() => void persist({ publish: false })}>
                  {t('agent.agentCenter.wizard.saveDraftAndBack')}
                </Button>
              )}
              <Button type='primary' onClick={() => setStep((s) => Math.min(STEP_KEYS.length - 1, s + 1))}>
                {t('agent.agentCenter.wizard.next')}
              </Button>
            </>
          ) : (
            <>
              <Button loading={saving} onClick={() => void persist({ publish: false })}>
                {t('agent.agentCenter.wizard.saveDraft')}
              </Button>
              <Button type='primary' loading={saving} onClick={() => void persist({ publish: true })}>
                {version > 0
                  ? t('agent.agentCenter.wizard.publishAs', { version: version + 1 })
                  : t('agent.agentCenter.list.publish')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentCenterWizardPage;
