import { Button, Input, Message, Select, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type {
  AgentCenterDetail,
  AgentMcpPolicy,
  AgentVisibility,
  CreateAgentCenterRequest,
} from '@/common/types/agent/agentCenterTypes';
import WorkMateSteps from '@renderer/components/base/WorkMateSteps';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const { Title, Text } = Typography;

const STEPS = ['身份', '引擎', '指令', 'Skills', 'MCP', '发布'];

const visibilityLabel: Record<AgentVisibility, string> = {
  private: '仅自己',
  team: '团队',
  enterprise: '企业',
};

const AgentCenterWizardPage: React.FC<{ mode: 'create' | 'edit' }> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [message, messageContext] = Message.useMessage({ maxCount: 5 });
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [agentId, setAgentId] = useState(id ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<AgentVisibility>('private');
  const [instructions, setInstructions] = useState('');
  const [skillKeys, setSkillKeys] = useState('');
  const [mcpIds, setMcpIds] = useState('');
  const [mcpPolicy, setMcpPolicy] = useState<AgentMcpPolicy>('allowlist');
  const [engineAgentId, setEngineAgentId] = useState('');

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

  const persist = async (publish: boolean) => {
    if (!name.trim()) {
      message.warning('请填写名称');
      setStep(0);
      return;
    }
    setSaving(true);
    try {
      const meta = {
        visibility,
        mcp_policy: mcpPolicy,
        skill_refs: skillRefs,
        mcp_ids: mcpPolicy === 'allowlist' ? mcpIdList : undefined,
        knowledge_scopes: [] as [],
      };
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
      } else {
        await ipcBridge.agentCenter.update.invoke({
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
      }

      if (publish && currentId) {
        await ipcBridge.agentCenter.publish.invoke({ id: currentId, pin_skills_on_publish: true });
        message.success('已发布');
      } else {
        message.success('已保存草稿');
      }
      navigate('/agent-center');
    } catch (error) {
      console.error(error);
      message.error(publish ? '发布失败' : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='h-full overflow-auto p-24px max-w-720px'>
      {messageContext}
      <Button type='text' className='!px-0 mb-8px' onClick={() => navigate('/agent-center')}>
        ← 返回智能体中心
      </Button>
      <Title heading={4} className='!mb-16px'>
        {mode === 'create' ? '新建智能体' : '编辑智能体'}
      </Title>

      <WorkMateSteps current={step} className='mb-24px'>
        {STEPS.map((title) => (
          <WorkMateSteps.Step key={title} title={title} />
        ))}
      </WorkMateSteps>

      {step === 0 && (
        <div className='flex flex-col gap-12px'>
          <label>
            <Text>名称</Text>
            <Input value={name} onChange={setName} placeholder='例如：投研助手' />
          </label>
          <label>
            <Text>简介</Text>
            <Input.TextArea value={description} onChange={setDescription} autoSize={{ minRows: 2, maxRows: 4 }} />
          </label>
          <label>
            <Text>可见性</Text>
            <Select value={visibility} onChange={(v) => setVisibility(v as AgentVisibility)}>
              <Select.Option value='private'>仅自己</Select.Option>
              <Select.Option value='team'>团队</Select.Option>
              <Select.Option value='enterprise' disabled>
                企业（即将推出）
              </Select.Option>
            </Select>
          </label>
        </div>
      )}

      {step === 1 && (
        <div className='flex flex-col gap-12px'>
          <Text type='secondary'>选择已有后端 Agent（Codex / Claude ACP / WorkMate 等），不新建运行时。</Text>
          <label>
            <Text>agent_id</Text>
            <Input value={engineAgentId} onChange={setEngineAgentId} placeholder='留空则使用默认 Agent' />
          </label>
        </div>
      )}

      {step === 2 && (
        <div className='flex flex-col gap-12px'>
          <Text type='secondary'>完整 rules 编辑可复用「助手」设置；此处记录产品意图草稿。</Text>
          <Input.TextArea
            value={instructions}
            onChange={setInstructions}
            placeholder='你是…'
            autoSize={{ minRows: 6, maxRows: 16 }}
          />
        </div>
      )}

      {step === 3 && (
        <div className='flex flex-col gap-12px'>
          <Text type='secondary'>Skills 引用（逗号分隔）。发布时默认 pin。</Text>
          <Input value={skillKeys} onChange={setSkillKeys} placeholder='workmate-presentation, …' />
        </div>
      )}

      {step === 4 && (
        <div className='flex flex-col gap-12px'>
          <label>
            <Text>MCP 策略</Text>
            <Select value={mcpPolicy} onChange={(v) => setMcpPolicy(v as AgentMcpPolicy)}>
              <Select.Option value='allowlist'>白名单（空 = 不挂载任何 MCP）</Select.Option>
              <Select.Option value='inherit_user_enabled'>使用用户已启用 MCP</Select.Option>
            </Select>
          </label>
          {mcpPolicy === 'allowlist' && (
            <label>
              <Text>MCP 服务器 ID（逗号分隔，可空）</Text>
              <Input value={mcpIds} onChange={setMcpIds} placeholder='留空则不挂载 MCP' />
            </label>
          )}
        </div>
      )}

      {step === 5 && (
        <div className='flex flex-col gap-8px'>
          <Text>确认配置后可保存草稿或发布。KnowHub 范围可选，当前可留空。</Text>
          <Text type='secondary'>
            {name || '（未命名）'} · {visibilityLabel[visibility]} · Skills {skillRefs.length} · MCP{' '}
            {mcpPolicy === 'allowlist' ? `${mcpIdList.length} 项白名单` : '继承用户'}
          </Text>
        </div>
      )}

      <div className='flex justify-between mt-24px'>
        <Button disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          上一步
        </Button>
        <div className='flex gap-8px'>
          {step < STEPS.length - 1 ? (
            <Button type='primary' onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              下一步
            </Button>
          ) : (
            <>
              <Button loading={saving} onClick={() => void persist(false)}>
                保存草稿
              </Button>
              <Button type='primary' loading={saving} onClick={() => void persist(true)}>
                发布
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentCenterWizardPage;
