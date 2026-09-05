import { Button, Input, Message, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;
const TextArea = Input.TextArea;

const SkillEvolutionCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [conversationId, setConversationId] = useState('');
  const [assistantId, setAssistantId] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [skillKey, setSkillKey] = useState('');
  const [draftMd, setDraftMd] = useState('');
  const [submitNow, setSubmitNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, messageContext] = Message.useMessage({ maxCount: 5 });

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
        选择会话（可选）与目标智能体，填写经验摘要；可自动生成 SKILL.md 草案，经审核后再写入 Skills Hub 并 pin 发布。
      </Text>

      <div className='flex flex-col gap-12px'>
        <div>
          <Text className='text-12px'>标题 *</Text>
          <Input className='mt-4px' value={title} onChange={setTitle} placeholder='例如：周报排版技能' />
        </div>
        <div>
          <Text className='text-12px'>会话 ID（可选，须属于当前用户）</Text>
          <Input
            className='mt-4px'
            value={conversationId}
            onChange={setConversationId}
            placeholder='从会话详情复制 conversation id'
          />
        </div>
        <div>
          <Text className='text-12px'>目标智能体 ID（可选）</Text>
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
            placeholder='留空则由服务端生成 stub 模板'
            autoSize={{ minRows: 6, maxRows: 16 }}
          />
        </div>
        <label className='flex items-center gap-8px text-13px'>
          <input type='checkbox' checked={submitNow} onChange={(e) => setSubmitNow(e.target.checked)} />
          创建后直接提交审核
        </label>
        <div className='flex gap-8px'>
          <Button type='primary' loading={busy} onClick={() => void handleCreate()}>
            创建提案
          </Button>
          <Button disabled={busy} onClick={() => navigate('/agent-center/skill-evolution')}>
            取消
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SkillEvolutionCreatePage;
