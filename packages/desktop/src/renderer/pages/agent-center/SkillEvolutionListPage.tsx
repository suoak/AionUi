import { Button, Input, Message, Tabs, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { SkillEvolutionProposal, SkillEvolutionStatus } from '@/common/types/agent/skillEvolutionTypes';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;
const TabPane = Tabs.TabPane;
const TextArea = Input.TextArea;

const statusLabel: Record<SkillEvolutionStatus, string> = {
  draft: '草稿',
  pending_review: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  applied: '已应用',
  rolled_back: '已回滚',
};

type Filter = 'all' | 'pending_review' | 'draft' | 'approved' | 'applied';

const SkillEvolutionListPage: React.FC = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('pending_review');
  const [items, setItems] = useState<SkillEvolutionProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SkillEvolutionProposal | null>(null);
  const [comment, setComment] = useState('');
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const [message, messageContext] = Message.useMessage({ maxCount: 5 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await ipcBridge.skillEvolution.listProposals.invoke({
        status: filter === 'all' ? undefined : filter,
        limit: 100,
      });
      setItems(list);
    } catch (error) {
      console.error(error);
      message.error('加载技能提案失败（需 Core 含技能进化 API）');
    } finally {
      setLoading(false);
    }
  }, [filter, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: string) => {
    try {
      const detail = await ipcBridge.skillEvolution.getProposal.invoke({ id });
      setSelected(detail);
      setExportPreview(null);
      setComment('');
    } catch (error) {
      console.error(error);
      message.error('加载提案详情失败');
    }
  };

  const runAction = async (id: string, action: 'submit' | 'approve' | 'reject' | 'apply' | 'rollback') => {
    setBusyId(id);
    try {
      if (action === 'submit') {
        await ipcBridge.skillEvolution.submitProposal.invoke({ id });
        message.success('已提交审核');
      } else if (action === 'approve') {
        const res = await ipcBridge.skillEvolution.approveProposal.invoke({ id, comment: comment || undefined });
        setExportPreview(res.export.skill_md);
        message.success(`已通过，可导出到 ${res.export.suggested_path}`);
      } else if (action === 'reject') {
        await ipcBridge.skillEvolution.rejectProposal.invoke({ id, comment: comment || undefined });
        message.success('已拒绝，经验库已记录');
      } else if (action === 'apply') {
        const res = await ipcBridge.skillEvolution.applyProposal.invoke({ id });
        setExportPreview(res.export.skill_md);
        message.success('已标记应用（请将 SKILL.md 写入 Skills Hub / 工作区）');
      } else {
        await ipcBridge.skillEvolution.rollbackProposal.invoke({ id, comment: comment || undefined });
        message.success('已回滚技能指针（经验库保留）');
      }
      await load();
      await openDetail(id);
    } catch (error) {
      console.error(error);
      message.error('操作失败');
    } finally {
      setBusyId(null);
    }
  };

  const copyExport = async () => {
    if (!exportPreview) return;
    try {
      await navigator.clipboard.writeText(exportPreview);
      message.success('SKILL.md 已复制到剪贴板');
    } catch {
      message.error('复制失败');
    }
  };

  return (
    <div className='h-full overflow-auto p-24px'>
      {messageContext}
      <div className='flex items-center justify-between mb-16px gap-12px flex-wrap'>
        <div>
          <Title heading={4} className='!mb-4px'>
            技能进化
          </Title>
          <Text type='secondary'>
            从会话经验提炼 SKILL.md 提案 → 人工审核 → 导出/绑定 Skills。经验库不对日常对话注入；知识库产品保持独立。
          </Text>
        </div>
        <div className='flex gap-8px'>
          <Button onClick={() => navigate('/agent-center')}>返回智能体中心</Button>
          <Button type='primary' onClick={() => navigate('/agent-center/skill-evolution/new')}>
            从会话提炼技能
          </Button>
        </div>
      </div>

      <Tabs activeTab={filter} onChange={(key) => setFilter(key as Filter)}>
        <TabPane key='pending_review' title='待审核' />
        <TabPane key='draft' title='草稿' />
        <TabPane key='approved' title='已通过' />
        <TabPane key='applied' title='已应用' />
        <TabPane key='all' title='全部' />
      </Tabs>

      <div className='mt-16px grid grid-cols-1 lg:grid-cols-2 gap-16px'>
        <div className='flex flex-col gap-12px'>
          {loading && <Text type='secondary'>加载中…</Text>}
          {!loading && items.length === 0 && <Text type='secondary'>暂无提案。可从会话提炼技能开始。</Text>}
          {items.map((item) => {
            const busy = busyId === item.id;
            return (
              <div
                key={item.id}
                className='rounded-8px border border-[var(--color-border-2)] p-16px cursor-pointer hover:bg-[var(--color-fill-1)]'
                onClick={() => void openDetail(item.id)}
              >
                <div className='font-medium truncate'>{item.title}</div>
                <Text type='secondary' className='text-12px'>
                  {statusLabel[item.status]} · {item.target_skill_key ?? '未命名 skill'}
                  {item.conversation_id ? ` · 会话 ${item.conversation_id.slice(0, 8)}…` : ''}
                </Text>
                <div className='mt-8px flex gap-8px' onClick={(e) => e.stopPropagation()}>
                  {item.status === 'draft' ? (
                    <Button size='mini' loading={busy} onClick={() => void runAction(item.id, 'submit')}>
                      提交审核
                    </Button>
                  ) : null}
                  {item.status === 'pending_review' || item.status === 'draft' ? (
                    <>
                      <Button size='mini' type='primary' loading={busy} onClick={() => void runAction(item.id, 'approve')}>
                        通过
                      </Button>
                      <Button size='mini' status='danger' loading={busy} onClick={() => void runAction(item.id, 'reject')}>
                        拒绝
                      </Button>
                    </>
                  ) : null}
                  {item.status === 'approved' ? (
                    <Button size='mini' type='primary' loading={busy} onClick={() => void runAction(item.id, 'apply')}>
                      标记已应用
                    </Button>
                  ) : null}
                  {item.status === 'applied' || item.status === 'approved' ? (
                    <Button size='mini' loading={busy} onClick={() => void runAction(item.id, 'rollback')}>
                      回滚
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className='rounded-8px border border-[var(--color-border-2)] p-16px min-h-320px'>
          {!selected ? (
            <Text type='secondary'>选择左侧提案查看草案与审核。</Text>
          ) : (
            <div className='flex flex-col gap-12px'>
              <div>
                <div className='font-medium text-16px'>{selected.title}</div>
                <Text type='secondary' className='text-12px'>
                  {statusLabel[selected.status]} · {selected.id}
                </Text>
              </div>
              <div>
                <Text className='text-12px'>经验摘要</Text>
                <pre className='mt-4px whitespace-pre-wrap text-13px bg-[var(--color-fill-1)] p-12px rounded-6px max-h-160px overflow-auto'>
                  {selected.experience_summary || '（空）'}
                </pre>
              </div>
              <div>
                <Text className='text-12px'>SKILL.md 草案</Text>
                <pre className='mt-4px whitespace-pre-wrap text-12px bg-[var(--color-fill-1)] p-12px rounded-6px max-h-280px overflow-auto'>
                  {selected.draft_skill_md}
                </pre>
              </div>
              <div>
                <Text className='text-12px'>审核意见（可选）</Text>
                <TextArea
                  className='mt-4px'
                  value={comment}
                  onChange={setComment}
                  placeholder='通过/拒绝/回滚时可填写'
                  autoSize={{ minRows: 2, maxRows: 4 }}
                />
              </div>
              {exportPreview ? (
                <div>
                  <div className='flex items-center justify-between'>
                    <Text className='text-12px'>导出预览</Text>
                    <Button size='mini' onClick={() => void copyExport()}>
                      复制 SKILL.md
                    </Button>
                  </div>
                  <pre className='mt-4px whitespace-pre-wrap text-12px bg-[var(--color-fill-1)] p-12px rounded-6px max-h-200px overflow-auto'>
                    {exportPreview}
                  </pre>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SkillEvolutionListPage;
