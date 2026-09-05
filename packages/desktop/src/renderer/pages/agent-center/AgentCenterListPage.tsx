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
  team: '团队',
  enterprise: '企业',
};

const AgentCenterListPage: React.FC = () => {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>('mine');
  const [items, setItems] = useState<AgentCenterListItem[]>([]);
  const [loading, setLoading] = useState(false);
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

  const handleRun = async (id: string) => {
    try {
      const plan = await ipcBridge.agentCenter.run.invoke({ id });
      navigate('/guid', {
        state: {
          selectedAssistantId: plan.assistant_id,
          agentCenterRunPlan: plan.create_conversation,
        },
      });
    } catch (error) {
      console.error(error);
      message.error('准备运行失败');
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
          <Text type='secondary'>创建 → 配置说明与能力 → 试跑 → 发布。复用现有助手与会话运行时。</Text>
        </div>
        <Button type='primary' onClick={() => navigate('/agent-center/new')}>
          新建智能体
        </Button>
      </div>

      <Tabs activeTab={scope} onChange={(key) => setScope(key as Scope)}>
        <TabPane key='mine' title='我的' />
        <TabPane key='team' title='团队' />
        <TabPane key='enterprise' title='企业' disabled />
      </Tabs>

      <div className='mt-16px flex flex-col gap-12px'>
        {loading && <Text type='secondary'>加载中…</Text>}
        {!loading && items.length === 0 && <Text type='secondary'>暂无智能体。点击「新建智能体」开始。</Text>}
        {items.map((item) => (
          <div
            key={item.assistant.id}
            className='rounded-8px border border-[var(--color-border-2)] p-16px flex items-center justify-between gap-12px'
          >
            <div className='min-w-0'>
              <div className='font-medium truncate'>{item.assistant.name}</div>
              <Text type='secondary' className='text-12px'>
                {visibilityLabel[item.meta.visibility]} · {statusLabel[item.meta.status] ?? item.meta.status}
                {item.meta.version > 0 ? ` · v${item.meta.version}` : ''}
              </Text>
              {item.assistant.description ? (
                <div className='text-13px mt-4px text-[var(--color-text-2)] line-clamp-2'>{item.assistant.description}</div>
              ) : null}
            </div>
            <div className='flex gap-8px shrink-0'>
              <Button size='small' type='primary' onClick={() => void handleRun(item.assistant.id)}>
                运行
              </Button>
              <Button size='small' onClick={() => navigate(`/agent-center/${item.assistant.id}/edit`)}>
                编辑
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AgentCenterListPage;
