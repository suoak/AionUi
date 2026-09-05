import { Button, Input, Message, Select, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { SkillEvolutionTrajectoryOverview } from '@/common/types/agent/skillEvolutionTypes';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const { Title, Text } = Typography;
const TextArea = Input.TextArea;

const SkillEvolutionCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledConversationId = searchParams.get('conversation_id') ?? '';
  const prefilledAssistantId = searchParams.get('assistant_id') ?? '';

  const [conversations, setConversations] = useState<TChatConversation[]>([]);
  const [conversationId, setConversationId] = useState(prefilledConversationId);
  const [assistantId, setAssistantId] = useState(prefilledAssistantId);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [skillKey, setSkillKey] = useState('');
  const [draftMd, setDraftMd] = useState('');
  const [submitNow, setSubmitNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [evolving, setEvolving] = useState(false);
  const [overview, setOverview] = useState<SkillEvolutionTrajectoryOverview | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [message, messageContext] = Message.useMessage({ maxCount: 5 });

  useEffect(() => {
    void (async () => {
      try {
        const page = await ipcBridge.database.getUserConversations.invoke({ limit: 50 });
        setConversations(page.items ?? []);
      } catch (error) {
        console.error(error);
      }
    })();
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setOverview(null);
      return;
    }
    void (async () => {
      try {
        const traj = await ipcBridge.conversation.getTrajectory.invoke({
          conversation_id: conversationId,
          limit: 40,
        });
        setOverview({
          turns: traj.overview?.turns ?? 0,
          steps: traj.overview?.steps ?? 0,
          tools: traj.overview?.tools ?? 0,
          errors: traj.overview?.errors ?? 0,
          record_count: traj.records?.length ?? 0,
          digest_md: '',
          conversation_name: conversations.find((c) => c.id === conversationId)?.name,
        });
      } catch (error) {
        console.error(error);
        setOverview(null);
      }
    })();
  }, [conversationId, conversations]);

  const conversationOptions = useMemo(() => {
    const filtered = assistantId
      ? conversations.filter((c) => {
          const aid =
            (c as { assistant?: { id?: string } }).assistant?.id ||
            (c as { extra?: { preset_assistant_id?: string } }).extra?.preset_assistant_id;
          return !aid || aid === assistantId;
        })
      : conversations;
    return filtered.map((c) => ({
      label: `${c.name || '未命名'} (${c.id.slice(0, 8)}…)`,
      value: c.id,
    }));
  }, [conversations, assistantId]);

  const handleEvolve = async () => {
    if (!conversationId.trim()) {
      message.error('请先选择会话');
      return;
    }
    setEvolving(true);
    try {
      const res = await ipcBridge.skillEvolution.evolveFromConversation.invoke({
        conversation_id: conversationId.trim(),
        assistant_id: assistantId.trim() || undefined,
        title: title.trim() || undefined,
        target_skill_key: skillKey.trim() || undefined,
        submit: false,
      });
      setTitle(res.proposal.title);
      setSummary(res.proposal.experience_summary);
      setSkillKey(res.proposal.target_skill_key ?? '');
      setDraftMd(res.proposal.draft_skill_md);
      setOverview(res.trajectory_overview);
      setModelUsed(res.model_used ?? null);
      message.success(
        `智能提炼完成${res.model_used ? `（模型 ${res.model_used}）` : ''}，经验库已写入 ${res.experience_articles.length} 篇，请编辑后创建/提交`
      );
      navigate(
        assistantId
          ? `/agent-center/skill-evolution?assistant_id=${encodeURIComponent(assistantId)}`
          : '/agent-center/skill-evolution',
        { state: { highlightId: res.proposal.id } }
      );
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : '智能提炼失败';
      message.error(
        msg.includes('模型') || msg.includes('model') ? msg : '智能提炼失败（请确认已配置模型且 Core 含 Phase 2 API）'
      );
    } finally {
      setEvolving(false);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      message.error('请填写标题');
      return;
    }
    setBusy(true);
    try {
      const created = await ipcBridge.skillEvolution.createProposal.invoke({
        title: title.trim(),
        conversation_id: conversationId.trim() || undefined,
        assistant_id: assistantId.trim() || undefined,
        experience_summary: summary.trim() || undefined,
        target_skill_key: skillKey.trim() || undefined,
        draft_skill_md: draftMd.trim() || undefined,
        auto_stub: !draftMd.trim(),
        submit: submitNow,
        action: 'create',
      });
      message.success(submitNow ? '提案已创建并提交审核' : '提案草稿已保存');
      navigate('/agent-center/skill-evolution', { state: { highlightId: created.id } });
    } catch (error) {
      console.error(error);
      message.error('创建失败（请确认会话归属与 Core 版本）');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='h-full overflow-auto p-24px max-w-880px'>
      {messageContext}
      <Button type='text' className='!px-0 mb-8px' onClick={() => navigate('/agent-center/skill-evolution')}>
        ← 返回技能进化
      </Button>
      <Title heading={4} className='!mb-4px'>
        从会话提炼技能
      </Title>
      <Text type='secondary' className='block mb-16px'>
        从最近会话选择轨迹 →「智能提炼」调用 Maintainer/Proposer →
        编辑草案后提交审核。经验库仅用于技能进化，不会注入日常对话。
      </Text>

      <div className='flex flex-col gap-12px'>
        <div>
          <Text className='text-12px'>选择会话 *</Text>
          <Select
            className='mt-4px w-full'
            allowClear
            showSearch
            placeholder='从最近会话中选择'
            options={conversationOptions}
            value={conversationId || undefined}
            onChange={(v) => setConversationId((v as string) ?? '')}
          />
          {!conversationOptions.length ? (
            <Text type='secondary' className='text-12px mt-4px block'>
              也可手动粘贴会话 ID
            </Text>
          ) : null}
          <Input
            className='mt-8px'
            value={conversationId}
            onChange={setConversationId}
            placeholder='或粘贴 conversation id'
          />
        </div>

        {overview ? (
          <div className='rounded-8px border border-[var(--color-border-2)] p-12px bg-[var(--color-fill-1)]'>
            <Text className='text-12px font-medium'>轨迹概览</Text>
            <Text type='secondary' className='text-12px block mt-4px'>
              {overview.conversation_name ? `${overview.conversation_name} · ` : ''}
              turns {overview.turns} · steps {overview.steps} · tools {overview.tools} · errors {overview.errors}
              {overview.record_count ? ` · records ${overview.record_count}` : ''}
            </Text>
            {modelUsed ? (
              <Text type='secondary' className='text-12px block mt-4px'>
                上次提炼模型：{modelUsed}
              </Text>
            ) : null}
          </div>
        ) : null}

        <div className='flex gap-8px flex-wrap'>
          <Button
            type='primary'
            loading={evolving}
            disabled={!conversationId.trim()}
            onClick={() => void handleEvolve()}
          >
            智能提炼
          </Button>
          <Text type='secondary' className='text-12px self-center'>
            需已配置可用模型；成功后进入可编辑提案
          </Text>
        </div>

        <div>
          <Text className='text-12px'>标题 *</Text>
          <Input className='mt-4px' value={title} onChange={setTitle} placeholder='例如：周报排版技能' />
        </div>
        <div>
          <Text className='text-12px'>目标智能体 ID（可选，通过后可 pin）</Text>
          <Input className='mt-4px' value={assistantId} onChange={setAssistantId} placeholder='assistant id' />
        </div>
        <div>
          <Text className='text-12px'>建议 skill key</Text>
          <Input className='mt-4px' value={skillKey} onChange={setSkillKey} placeholder='workmate-weekly-report' />
        </div>
        <div>
          <Text className='text-12px'>经验摘要</Text>
          <TextArea
            className='mt-4px'
            value={summary}
            onChange={setSummary}
            placeholder='这次会话里哪些策略有效？失败根因是什么？'
            autoSize={{ minRows: 4, maxRows: 10 }}
          />
        </div>
        <div>
          <Text className='text-12px'>SKILL.md 草案（可空=自动生成模板）</Text>
          <TextArea
            className='mt-4px font-mono text-12px'
            value={draftMd}
            onChange={setDraftMd}
            placeholder='留空则由服务端生成 stub 模板；智能提炼会填充'
            autoSize={{ minRows: 6, maxRows: 16 }}
          />
        </div>
        <label className='flex items-center gap-8px text-13px'>
          <input type='checkbox' checked={submitNow} onChange={(e) => setSubmitNow(e.target.checked)} />
          手工创建后直接提交审核
        </label>
        <div className='flex gap-8px'>
          <Button type='outline' loading={busy} onClick={() => void handleCreate()}>
            手工创建提案
          </Button>
          <Button disabled={busy || evolving} onClick={() => navigate('/agent-center/skill-evolution')}>
            取消
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SkillEvolutionCreatePage;
