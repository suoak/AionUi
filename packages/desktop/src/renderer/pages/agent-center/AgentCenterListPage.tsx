import { Button, Message, Modal, Tabs, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { AgentCenterListItem, AgentVisibility } from '@/common/types/agent/agentCenterTypes';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatAgentCenterError } from './agentCenterErrors';

const { Title, Text } = Typography;
const TabPane = Tabs.TabPane;

type Scope = 'mine' | 'team' | 'enterprise';

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

const AgentCenterListPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [scope, setScope] = useState<Scope>('mine');
  const [items, setItems] = useState<AgentCenterListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, messageContext] = Message.useMessage({ maxCount: 5 });
  // Arco useMessage() returns a new API object each render — keep a ref so
  // load() deps stay stable and we do not re-fetch in a loop.
  const messageRef = useRef(message);
  messageRef.current = message;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await ipcBridge.agentCenter.list.invoke({ scope });
      setItems(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error(error);
      const msg = formatAgentCenterError(error, '加载智能体列表失败');
      setLoadError(msg);
      setItems([]);
      messageRef.current.error(msg);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleTryRun = async (id: string) => {
    setBusyId(id);
    try {
      const plan = await ipcBridge.agentCenter.run.invoke({ id });
      navigate('/guid', {
        state: {
          selectedAssistantId: plan.assistant_id,
          agentCenterRunPlan: plan.create_conversation,
          agentCenterPreviewMode: plan.preview_mode,
          focusPrefill: true,
        },
      });
    } catch (error) {
      console.error(error);
      messageRef.current.error(formatAgentCenterError(error, '准备试跑失败'));
    } finally {
      setBusyId(null);
    }
  };

  const handlePublish = async (id: string) => {
    setBusyId(id);
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
      setBusyId(null);
    }
  };

  const handleUnpublish = (id: string) => {
    Modal.confirm({
      title: t('agent.agentCenter.unpublish.confirmTitle'),
      content: t('agent.agentCenter.unpublish.confirmDescription'),
      okText: t('agent.agentCenter.actions.unpublish'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setBusyId(id);
        try {
          await ipcBridge.agentCenter.unpublish.invoke({ id });
          messageRef.current.success(t('agent.agentCenter.unpublish.success'));
          await load();
        } catch (error) {
          console.error(error);
          messageRef.current.error(formatAgentCenterError(error, t('agent.agentCenter.unpublish.error')));
          throw error;
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  return (
    <div className='h-full overflow-auto p-24px'>
      {messageContext}
      <div className='flex items-center justify-between mb-16px gap-12px flex-wrap'>
        <div>
          <Title heading={4} className='!mb-4px'>
            智能体中心
          </Title>
          <Text type='secondary'>{t('agent.agentCenter.description')}</Text>
        </div>
        <Button type='primary' onClick={() => navigate('/agent-center/new')}>
          创建智能体
        </Button>
      </div>

      <Tabs activeTab={scope} onChange={(key) => setScope(key as Scope)}>
        <TabPane key='mine' title='我的' />
        <TabPane key='team' title='团队共享' />
        <TabPane key='enterprise' title='企业市场' disabled />
      </Tabs>

      <div className='mt-16px flex flex-col gap-12px'>
        {loading && <Text type='secondary'>加载中…</Text>}
        {!loading && loadError && (
          <div className='rounded-8px border border-[var(--color-danger-light-3)] bg-[var(--color-danger-light-1)] p-12px flex items-center justify-between gap-12px'>
            <Text type='error'>{loadError}</Text>
            <Button size='small' onClick={() => void load()}>
              重试
            </Button>
          </div>
        )}
        {!loading && !loadError && items.length === 0 && (
          <Text type='secondary'>暂无智能体。点击「创建智能体」开始配置与试跑。</Text>
        )}
        {items.map((item) => {
          const id = item.assistant.id;
          const isDraft = item.meta.status === 'draft';
          const busy = busyId === id;
          return (
            <div
              key={id}
              className='rounded-8px border border-[var(--color-border-2)] p-16px flex items-center justify-between gap-12px'
            >
              <div
                className='min-w-0 cursor-pointer'
                onClick={() => navigate(`/agent-center/${id}`)}
                role='button'
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/agent-center/${id}`);
                }}
              >
                <div className='font-medium truncate'>{item.assistant.name}</div>
                <Text type='secondary' className='text-12px'>
                  {visibilityLabel[item.meta.visibility]} · {statusLabel[item.meta.status] ?? item.meta.status}
                  {item.meta.version > 0 ? ` · v${item.meta.version}` : ' · 未发布'}
                  {item.meta.skill_refs?.length ? ` · Skills ${item.meta.skill_refs.length}` : ''}
                </Text>
                {item.assistant.description ? (
                  <div className='text-13px mt-4px text-[var(--color-text-2)] line-clamp-2'>
                    {item.assistant.description}
                  </div>
                ) : null}
              </div>
              <div className='flex gap-8px shrink-0'>
                <Button size='small' type='primary' loading={busy} onClick={() => void handleTryRun(id)}>
                  试跑
                </Button>
                <Button size='small' disabled={busy} onClick={() => navigate(`/agent-center/${id}`)}>
                  详情
                </Button>
                <Button size='small' disabled={busy} onClick={() => navigate(`/agent-center/${id}/edit`)}>
                  编辑
                </Button>
                {isDraft ? (
                  <Button size='small' loading={busy} onClick={() => void handlePublish(id)}>
                    发布
                  </Button>
                ) : (
                  scope === 'mine' &&
                  item.meta.status === 'published' && (
                    <Button size='small' status='danger' disabled={busy} onClick={() => handleUnpublish(id)}>
                      {t('agent.agentCenter.actions.unpublish')}
                    </Button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AgentCenterListPage;
