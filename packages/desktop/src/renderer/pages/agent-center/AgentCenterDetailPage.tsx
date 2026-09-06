import { Button, Message, Modal, Tag, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { AgentCenterDetail, AgentVisibility } from '@/common/types/agent/agentCenterTypes';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { formatAgentCenterError } from './agentCenterErrors';

const { Title, Text } = Typography;

const statusLabel: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
};

const visibilityLabel: Record<AgentVisibility, string> = {
  private: '仅自己',
  team: '团队共享',
  enterprise: '企业',
};

/**
 * ChatGPT-inspired agent detail hub: instructions, capabilities, skills, and
 * lifecycle actions. Skill evolution is intentionally a separate product area.
 */
const AgentCenterDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [message, messageContext] = Message.useMessage({ maxCount: 5 });
  const messageRef = useRef(message);
  messageRef.current = message;
  const [detail, setDetail] = useState<AgentCenterDetail | null>(null);
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const agent = await ipcBridge.agentCenter.get.invoke({ id });
      setDetail(agent);
      setInstructions(agent.assistant.rules?.content ?? '');
    } catch (error) {
      console.error(error);
      const msg = formatAgentCenterError(error, '加载智能体详情失败');
      setDetail(null);
      setLoadError(msg);
      messageRef.current.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const chips = useMemo(() => {
    if (!detail) return [] as string[];
    const out: string[] = [];
    out.push(visibilityLabel[detail.meta.visibility]);
    out.push(statusLabel[detail.meta.status] ?? detail.meta.status);
    if (detail.meta.version > 0) out.push(`v${detail.meta.version}`);
    out.push(`Skills ${detail.meta.skill_refs.length}`);
    out.push(detail.meta.mcp_policy === 'allowlist' ? 'MCP 白名单' : 'MCP 继承用户');
    const model = detail.assistant.defaults.model;
    if (model.mode === 'fixed' && model.value) out.push(`模型 ${model.value}`);
    else out.push('模型 自动');
    return out;
  }, [detail]);

  const handleTryRun = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const plan = await ipcBridge.agentCenter.run.invoke({ id });
      navigate('/guid', {
        state: {
          selectedAssistantId: plan.assistant_id,
          agentCenterRunPlan: plan.create_conversation,
          agentCenterPreviewMode: plan.preview_mode,
          focusPrefill: true,
          agentCenterReturnTo: `/agent-center/${id}`,
        },
      });
    } catch (error) {
      console.error(error);
      messageRef.current.error(formatAgentCenterError(error, '准备试跑失败'));
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const published = await ipcBridge.agentCenter.publish.invoke({
        id,
        pin_skills_on_publish: true,
      });
      messageRef.current.success(`已发布 v${published.meta.version}`);
      await load();
    } catch (error) {
      console.error(error);
      messageRef.current.error(formatAgentCenterError(error, '发布失败'));
    } finally {
      setBusy(false);
    }
  };

  const handleUnpublish = () => {
    if (!id) return;
    Modal.confirm({
      title: t('agent.agentCenter.unpublish.confirmTitle'),
      content: t('agent.agentCenter.unpublish.confirmDescription'),
      okText: t('agent.agentCenter.actions.unpublish'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setBusy(true);
        try {
          await ipcBridge.agentCenter.unpublish.invoke({ id });
          messageRef.current.success(t('agent.agentCenter.unpublish.success'));
          await load();
        } catch (error) {
          console.error(error);
          messageRef.current.error(formatAgentCenterError(error, t('agent.agentCenter.unpublish.error')));
          throw error;
        } finally {
          setBusy(false);
        }
      },
    });
  };

  if (!id) {
    return (
      <div className='p-24px'>
        <Text type='secondary'>缺少智能体 ID</Text>
      </div>
    );
  }

  return (
    <div className='h-full overflow-auto p-24px max-w-880px' data-testid='agent-center-detail'>
      {messageContext}
      <Button type='text' className='!px-0 mb-8px' onClick={() => navigate('/agent-center')}>
        ← 返回智能体中心
      </Button>

      {loading && <Text type='secondary'>加载中…</Text>}
      {!loading && loadError && (
        <div className='mb-12px flex items-center justify-between gap-12px'>
          <Text type='error'>{loadError}</Text>
          <Button size='small' onClick={() => void load()}>
            重试
          </Button>
        </div>
      )}
      {!loading && !loadError && !detail && <Text type='secondary'>未找到智能体</Text>}

      {detail ? (
        <>
          <div className='flex items-start justify-between gap-12px flex-wrap mb-16px'>
            <div className='min-w-0'>
              <Title heading={4} className='!mb-4px'>
                {detail.assistant.profile.name}
              </Title>
              <Text type='secondary' className='block mb-8px'>
                {detail.assistant.profile.description || '（暂无简介）'}
              </Text>
              <div className='flex flex-wrap gap-6px'>
                {chips.map((c) => (
                  <Tag key={c} size='small' color='arcoblue'>
                    {c}
                  </Tag>
                ))}
              </div>
            </div>
            <div className='flex gap-8px flex-wrap shrink-0'>
              <Button type='primary' loading={busy} onClick={() => void handleTryRun()}>
                试跑
              </Button>
              <Button loading={busy} onClick={() => navigate(`/agent-center/${id}/edit`)}>
                编辑
              </Button>
              {detail.meta.status === 'draft' || detail.meta.status === 'published' ? (
                <Button loading={busy} onClick={() => void handlePublish()}>
                  {detail.meta.status === 'draft' ? '发布' : '重新发布'}
                </Button>
              ) : null}
              {detail.meta.status === 'published' ? (
                <Button status='danger' loading={busy} onClick={handleUnpublish}>
                  {t('agent.agentCenter.actions.unpublish')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className='grid grid-cols-1 lg:grid-cols-2 gap-16px mb-16px'>
            <div className='rounded-8px border border-[var(--color-border-2)] p-16px'>
              <Text bold className='block mb-8px'>
                指令摘要
              </Text>
              {instructions.trim() ? (
                <pre className='m-0 whitespace-pre-wrap text-12px text-[var(--color-text-2)] max-h-220px overflow-auto'>
                  {instructions.trim().slice(0, 1200)}
                  {instructions.trim().length > 1200 ? '…' : ''}
                </pre>
              ) : (
                <Text type='secondary' className='text-12px'>
                  尚未填写指令。可在编辑向导「指令与个性」中完善。
                </Text>
              )}
              {(detail.assistant.prompts?.recommended?.length ?? 0) > 0 ? (
                <div className='mt-12px'>
                  <Text bold className='text-12px block mb-4px'>
                    对话开场白
                  </Text>
                  <ul className='m-0 pl-18px text-12px text-t-secondary'>
                    {detail.assistant.prompts.recommended.slice(0, 5).map((p, i) => (
                      <li key={`${p}-${i}`}>{p}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <Text type='secondary' className='text-12px mt-8px block'>
                  未配置对话开场白；试跑欢迎页将使用默认提示。
                </Text>
              )}
            </div>

            <div className='rounded-8px border border-[var(--color-border-2)] p-16px'>
              <Text bold className='block mb-8px'>
                已 pin 技能
              </Text>
              {detail.meta.skill_refs.length === 0 ? (
                <Text type='secondary' className='text-12px'>
                  {t('agent.agentCenter.emptyPinnedSkills')}
                </Text>
              ) : (
                <div className='flex flex-col gap-8px'>
                  {detail.meta.skill_refs.map((ref) => (
                    <div
                      key={`${ref.skill_key}-${ref.pinned_version ?? 'latest'}`}
                      className='text-13px flex justify-between gap-8px'
                    >
                      <span className='truncate font-medium'>{ref.skill_key}</span>
                      <Text type='secondary' className='text-12px shrink-0'>
                        {ref.version_policy === 'pin' ? `pin ${ref.pinned_version ?? ''}` : 'latest'}
                        {ref.source ? ` · ${ref.source}` : ''}
                      </Text>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default AgentCenterDetailPage;
