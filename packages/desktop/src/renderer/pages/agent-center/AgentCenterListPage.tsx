import { Button, Message, Tabs, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { AgentCenterListItem, AgentVisibility } from '@/common/types/agent/agentCenterTypes';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
  const [scope, setScope] = useState<Scope>('mine');
  const [items, setItems] = useState<AgentCenterListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, messageContext] = Message.useMessage({ maxCount: 5 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await ipcBridge.agentCenter.list.invoke({ scope });
      setItems(list);
    } catch (error) {
      console.error(error);
      message.error('加载智能体列表失败');
    } finally {
      setLoading(false);
    }
  }, [scope, message]);

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
      message.error('准备试跑失败');
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
      message.success(`已发布 v${published.meta.version}`);
      await load();
    } catch (error) {
      console.error(error);
      message.error('发布失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className='h-full overflow-auto p-24px'>
      {messageContext}
      <div className='flex items-center justify-between mb-16px gap-12px flex-wrap'>
        <div>
          <Title heading={4} className='!mb-4px'>
            智能体中心
          </Title>
          <Text type='secondary'>
            创建 → 指令与个性 → 能力配置 → 试跑预览 → 发布与共享。知识库产品保持独立，不在此捆绑。
          </Text>
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
        {!loading && items.length === 0 && <Text type='secondary'>暂无智能体。点击「创建智能体」开始配置与试跑。</Text>}
        {items.map((item) => {
          const id = item.assistant.id;
          const isDraft = item.meta.status === 'draft';
          const busy = busyId === id;
          return (
            <div
              key={id}
              className='rounded-8px border border-[var(--color-border-2)] p-16px flex items-center justify-between gap-12px'
            >
              <div className='min-w-0'>
                <div className='font-medium truncate'>{item.assistant.name}</div>
                <Text type='secondary' className='text-12px'>
                  {visibilityLabel[item.meta.visibility]} · {statusLabel[item.meta.status] ?? item.meta.status}
                  {item.meta.version > 0 ? ` · v${item.meta.version}` : ' · 未发布'}
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
                <Button size='small' disabled={busy} onClick={() => navigate(`/agent-center/${id}/edit`)}>
                  编辑
                </Button>
                {isDraft ? (
                  <Button size='small' loading={busy} onClick={() => void handlePublish(id)}>
                    发布
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AgentCenterListPage;
