import { Button, Input, Message, Select, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type {
  AgentCenterDetail,
  AgentMcpPolicy,
  AgentVisibility,
  CreateAgentCenterRequest,
} from '@/common/types/agent/agentCenterTypes';
import WorkMateSteps from '@renderer/components/base/WorkMateSteps';
import { fetchManagedAgents, type ManagedAgent } from '@renderer/utils/model/agentTypes';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const { Title, Text } = Typography;

/**
 * ChatGPT-inspired agent workflow (WorkMate voice, not UI clone):
 * 创建 → 指令与个性 → 能力配置 → 试跑预览 → 发布与共享
 * KnowHub / knowledge_scopes intentionally omitted from the primary flow.
 */
const STEPS = ['基本信息', '指令与个性', '能力配置', '试跑预览', '发布与共享'] as const;

const visibilityLabel: Record<AgentVisibility, string> = {
  private: '仅自己（私有）',
  team: '团队共享',
  enterprise: '企业',
};

const AgentCenterWizardPage: React.FC<{ mode: 'create' | 'edit' }> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [message, messageContext] = Message.useMessage({ maxCount: 5 });
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
  const [skillKeys, setSkillKeys] = useState('');
  const [mcpIds, setMcpIds] = useState('');
  const [mcpPolicy, setMcpPolicy] = useState<AgentMcpPolicy>('allowlist');
  const [engineAgentId, setEngineAgentId] = useState('');
  const [changelog, setChangelog] = useState('');
  const [managedAgents, setManagedAgents] = useState<ManagedAgent[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const agents = await fetchManagedAgents();
        setManagedAgents(agents.filter((a) => a.enabled !== false));
      } catch (error) {
        console.error(error);
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
        setSkillKeys(detail.meta.skill_refs.map((s) => s.skill_key).join(', '));
        setMcpIds(detail.assistant.defaults.mcps.value.join(', '));
        setMcpPolicy(detail.meta.mcp_policy);
        setEngineAgentId(detail.assistant.engine.agent_id);
        setStatus(detail.meta.status);
        setVersion(detail.meta.version);
      } catch (error) {
        console.error(error);
        message.error('加载智能体失败');
      }
    })();
  }, [mode, id, message]);

  const skillRefs = useMemo(
    () =>
      skillKeys
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((skill_key) => ({ skill_key, version_policy: 'pin' as const })),
    [skillKeys]
  );

  const mcpIdList = useMemo(
    () =>
      mcpIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [mcpIds]
  );

  const engineOptions = useMemo(() => {
    const opts = managedAgents.map((a) => ({
      value: a.id,
      label: a.name_i18n?.['zh-CN'] || a.name_i18n?.zh || a.name,
    }));
    if (engineAgentId && !opts.some((o) => o.value === engineAgentId)) {
      opts.unshift({ value: engineAgentId, label: engineAgentId });
    }
    return opts;
  }, [managedAgents, engineAgentId]);

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
      mcp_ids: mcpPolicy === 'allowlist' ? mcpIdList : undefined,
      // KnowHub stays out of primary UX; API field remains optional and empty.
    }),
    [visibility, mcpPolicy, skillRefs, mcpIdList]
  );

  const persist = async (opts: { publish: boolean; stay?: boolean }): Promise<string | null> => {
    if (!name.trim()) {
      message.warning('请填写名称');
      setStep(0);
      return null;
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
          defaults: {
            mcps: { mode: mcpPolicy === 'allowlist' ? 'fixed' : 'auto', value: mcpIdList },
            skills: { mode: 'fixed', value: skillRefs.map((s) => s.skill_key) },
          },
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
          defaults: {
            mcps: { mode: mcpPolicy === 'allowlist' ? 'fixed' : 'auto', value: mcpIdList },
            skills: { mode: 'fixed', value: skillRefs.map((s) => s.skill_key) },
          },
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
        message.success(`已发布 v${published.meta.version}`);
      } else if (!opts.stay) {
        message.success('已保存草稿');
      }

      if (!opts.stay) {
        navigate('/agent-center');
      }
      return currentId;
    } catch (error) {
      console.error(error);
      message.error(opts.publish ? '发布失败' : '保存失败');
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
        plan.preview_mode === 'published' ? `已发布 v${plan.revision || version}` : '草稿试跑（当前配置）';
      message.success(`正在打开对话 · ${previewHint}`);
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
      message.error('试跑失败，请先检查配置');
    } finally {
      setTrying(false);
    }
  };

  return (
    <div className='h-full overflow-auto p-24px max-w-720px'>
      {messageContext}
      <Button type='text' className='!px-0 mb-8px' onClick={() => navigate('/agent-center')}>
        ← 返回智能体中心
      </Button>
      <Title heading={4} className='!mb-4px'>
        {mode === 'create' ? '创建智能体' : '编辑智能体'}
      </Title>
      <Text type='secondary' className='mb-16px block'>
        创建 → 写指令 → 选能力 → 试跑 → 发布共享。复用现有助手与会话运行时，不捆绑知识库产品。
      </Text>

      <WorkMateSteps current={step} className='mb-24px' size='small'>
        {STEPS.map((title) => (
          <WorkMateSteps.Step key={title} title={title} />
        ))}
      </WorkMateSteps>

      {step === 0 && (
        <div className='flex flex-col gap-12px'>
          <Text type='secondary'>先起个名字和简介，方便自己和团队辨认（类似自定义 GPT 的名称卡）。</Text>
          <label>
            <Text>名称</Text>
            <Input value={name} onChange={setName} placeholder='例如：投研助手' />
          </label>
          <label>
            <Text>简介</Text>
            <Input.TextArea
              value={description}
              onChange={setDescription}
              placeholder='一句话说明它擅长什么'
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </label>
        </div>
      )}

      {step === 1 && (
        <div className='flex flex-col gap-12px'>
          <Text type='secondary'>用自然语言写清角色、语气与边界（对应 ChatGPT 的 Instructions / Personality）。</Text>
          <Input.TextArea
            value={instructions}
            onChange={setInstructions}
            placeholder={'你是…\n请用简洁、专业的中文回答。\n当信息不足时先提问再行动。'}
            autoSize={{ minRows: 8, maxRows: 18 }}
          />
        </div>
      )}

      {step === 2 && (
        <div className='flex flex-col gap-16px'>
          <div className='flex flex-col gap-8px'>
            <Text bold>后端 Agent / 模型引擎</Text>
            <Text type='secondary'>选择已有后端 Agent，不新建第二套运行时。</Text>
            <Select
              allowClear
              showSearch
              placeholder='留空则使用默认 Agent'
              value={engineAgentId || undefined}
              onChange={(v) => setEngineAgentId((v as string) || '')}
              options={engineOptions}
            />
          </div>
          <div className='flex flex-col gap-8px'>
            <Text bold>Skills</Text>
            <Text type='secondary'>引用 skill key（逗号分隔）。发布时默认 pin 版本。</Text>
            <Input value={skillKeys} onChange={setSkillKeys} placeholder='workmate-presentation, …' />
          </div>
          <div className='flex flex-col gap-8px'>
            <Text bold>MCP（可选）</Text>
            <Text type='secondary'>空白名单 = 不挂载任何 MCP。</Text>
            <Select value={mcpPolicy} onChange={(v) => setMcpPolicy(v as AgentMcpPolicy)}>
              <Select.Option value='allowlist'>白名单（空 = 不挂载）</Select.Option>
              <Select.Option value='inherit_user_enabled'>使用用户已启用 MCP</Select.Option>
            </Select>
            {mcpPolicy === 'allowlist' && (
              <Input value={mcpIds} onChange={setMcpIds} placeholder='MCP 服务器 ID，可留空' />
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className='flex flex-col gap-12px'>
          <Text type='secondary'>
            一键试跑会先保存当前草稿，再打开会话预览（类似 GPT 编辑器里的 Preview）。可随时回来改指令再试。
          </Text>
          <div className='rounded-8px border border-[var(--color-border-2)] p-16px flex flex-col gap-6px'>
            <Text bold>{name || '（未命名）'}</Text>
            <Text type='secondary' className='text-12px'>
              {status === 'published' ? `已发布 v${version}` : '草稿'}
              {engineAgentId ? ` · 引擎 ${engineAgentId}` : ' · 默认引擎'} · Skills {skillRefs.length} · MCP{' '}
              {mcpPolicy === 'allowlist' ? `${mcpIdList.length} 项白名单` : '继承用户'}
            </Text>
            {description ? <Text className='text-13px'>{description}</Text> : null}
            {instructions.trim() ? (
              <Text type='secondary' className='text-12px line-clamp-4 whitespace-pre-wrap'>
                {instructions.trim()}
              </Text>
            ) : (
              <Text type='secondary' className='text-12px'>
                （尚未填写指令）
              </Text>
            )}
          </div>
          <Button type='primary' loading={trying || saving} onClick={() => void handleTryRun()}>
            试跑对话
          </Button>
        </div>
      )}

      {step === 4 && (
        <div className='flex flex-col gap-12px'>
          <Text type='secondary'>
            发布会生成不可变版本快照；共享范围类似 GPT 的「仅自己 / 邀请他人」，企业市场暂未开放。
          </Text>
          <label>
            <Text>共享范围</Text>
            <Select value={visibility} onChange={(v) => setVisibility(v as AgentVisibility)}>
              <Select.Option value='private'>仅自己（私有）</Select.Option>
              <Select.Option value='team'>团队共享</Select.Option>
              <Select.Option value='enterprise' disabled>
                企业市场（即将推出）
              </Select.Option>
            </Select>
          </label>
          <label>
            <Text>版本说明（可选）</Text>
            <Input.TextArea
              value={changelog}
              onChange={setChangelog}
              placeholder='本次发布改了什么…'
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </label>
          <div className='rounded-8px bg-[var(--color-fill-1)] p-12px'>
            <Text type='secondary' className='text-12px'>
              {name || '（未命名）'} · {visibilityLabel[visibility]}
              {version > 0 ? ` · 当前 v${version}` : ' · 尚未发布'} · 发布后 Skills 默认 pin
            </Text>
          </div>
        </div>
      )}

      <div className='flex justify-between mt-24px'>
        <Button disabled={step === 0 || saving || trying} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          上一步
        </Button>
        <div className='flex gap-8px'>
          {step < STEPS.length - 1 ? (
            <>
              {step === 3 && (
                <Button loading={saving} onClick={() => void persist({ publish: false })}>
                  保存草稿并返回
                </Button>
              )}
              <Button type='primary' onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                下一步
              </Button>
            </>
          ) : (
            <>
              <Button loading={saving} onClick={() => void persist({ publish: false })}>
                保存草稿
              </Button>
              <Button type='primary' loading={saving} onClick={() => void persist({ publish: true })}>
                发布{version > 0 ? `为 v${version + 1}` : ''}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentCenterWizardPage;
