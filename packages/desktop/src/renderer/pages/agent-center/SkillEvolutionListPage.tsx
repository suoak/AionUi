import { Button, Input, Message, Tabs, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type {
  ExperienceArticle,
  SkillEvolutionProposal,
  SkillEvolutionStatus,
} from '@/common/types/agent/skillEvolutionTypes';
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

const kindLabel: Record<string, string> = {
  pattern: '模式',
  skill_impact: '影响笔记',
  rejected_note: '拒绝记录',
  index: '索引',
  general: '通用',
};

type Filter = 'all' | 'pending_review' | 'draft' | 'approved' | 'applied' | 'experience';

const SkillEvolutionListPage: React.FC = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('pending_review');
  const [items, setItems] = useState<SkillEvolutionProposal[]>([]);
  const [experience, setExperience] = useState<ExperienceArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SkillEvolutionProposal | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<ExperienceArticle | null>(null);
  const [comment, setComment] = useState('');
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const [applyPaths, setApplyPaths] = useState<string | null>(null);
  const [message, messageContext] = Message.useMessage({ maxCount: 5 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (filter === 'experience') {
        const list = await ipcBridge.skillEvolution.listExperience.invoke({ limit: 100 });
        setExperience(list);
      } else {
        const list = await ipcBridge.skillEvolution.listProposals.invoke({
          status: filter === 'all' ? undefined : filter,
          limit: 100,
        });
        setItems(list);
      }
    } catch (error) {
      console.error(error);
      message.error('加载失败（需 Core 含技能进化 API）');
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
      setSelectedArticle(null);
      setExportPreview(null);
      setApplyPaths(null);
      setComment('');
    } catch (error) {
      console.error(error);
      message.error('加载提案详情失败');
    }
  };

  const runAction = async (id: string, action: 'submit' | 'approve' | 'reject' | 'apply' | 'rollback' | 'evolve') => {
    setBusyId(id);
    try {
      if (action === 'submit') {
        await ipcBridge.skillEvolution.submitProposal.invoke({ id });
        message.success('已提交审核');
      } else if (action === 'approve') {
        const res = await ipcBridge.skillEvolution.approveProposal.invoke({ id, comment: comment || undefined });
        setExportPreview(res.export.skill_md);
        message.success(`已通过，可应用到 ${res.export.suggested_path}`);
      } else if (action === 'reject') {
        await ipcBridge.skillEvolution.rejectProposal.invoke({ id, comment: comment || undefined });
        message.success('已拒绝，经验库已记录');
      } else if (action === 'apply') {
        const res = await ipcBridge.skillEvolution.applyProposal.invoke({
          id,
          write_to_skills_hub: true,
          pin_on_assistant: true,
        });
        setExportPreview(res.export.skill_md);
        const parts = [
          res.skills_hub_path ? `Skills Hub: ${res.skills_hub_path}` : null,
          res.workspace_skill_path ? `工作区: ${res.workspace_skill_path}` : null,
          res.skill_ref ? `已 pin: ${res.skill_ref.skill_key}@${res.skill_ref.pinned_version ?? 'pin'}` : null,
        ].filter(Boolean);
        setApplyPaths(parts.join(' · ') || res.export.suggested_path);
        message.success(parts.length ? `已写入并应用：${parts.join('；')}` : '已标记应用');
      } else if (action === 'evolve') {
        const res = await ipcBridge.skillEvolution.evolveProposal.invoke({ id, submit: false });
        setSelected(res.proposal);
        setExportPreview(res.proposal.draft_skill_md);
        message.success(`已重新智能提炼${res.model_used ? `（${res.model_used}）` : ''}`);
      } else {
        await ipcBridge.skillEvolution.rollbackProposal.invoke({ id, comment: comment || undefined });
        message.success('已回滚技能指针（经验库保留）');
      }
      await load();
      if (action !== 'evolve') {
        await openDetail(id);
      }
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
            从会话经验提炼 SKILL.md 提案 → 人工审核 → 写入 Skills Hub /
            pin。经验库仅用于技能进化，不会注入日常对话；知识库产品保持独立。
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
        <TabPane key='experience' title='经验库' />
        <TabPane key='all' title='全部提案' />
      </Tabs>

      {filter === 'experience' ? (
        <div className='mt-16px grid grid-cols-1 lg:grid-cols-2 gap-16px'>
          <div className='flex flex-col gap-12px'>
            <Text type='secondary' className='text-12px'>
              经验库仅用于技能进化，不会注入日常对话。
            </Text>
            {loading && <Text type='secondary'>加载中…</Text>}
            {!loading && experience.length === 0 && (
              <Text type='secondary'>暂无经验文章。智能提炼或拒绝提案后会出现。</Text>
            )}
            {experience.map((item) => (
              <div
                key={item.id}
                className='rounded-8px border border-[var(--color-border-2)] p-16px cursor-pointer hover:bg-[var(--color-fill-1)]'
                onClick={() => {
                  setSelectedArticle(item);
                  setSelected(null);
                }}
              >
                <div className='font-medium truncate'>{item.title}</div>
                <Text type='secondary' className='text-12px'>
                  {kindLabel[item.kind] ?? item.kind} · {item.id.slice(0, 10)}…
                  {item.source_conversation_ids[0] ? ` · 会话 ${item.source_conversation_ids[0].slice(0, 8)}…` : ''}
                </Text>
              </div>
            ))}
          </div>
          <div className='rounded-8px border border-[var(--color-border-2)] p-16px min-h-320px'>
            {!selectedArticle ? (
              <Text type='secondary'>选择左侧经验文章查看正文与关联。</Text>
            ) : (
              <div className='flex flex-col gap-12px'>
                <div>
                  <div className='font-medium text-16px'>{selectedArticle.title}</div>
                  <Text type='secondary' className='text-12px'>
                    {kindLabel[selectedArticle.kind] ?? selectedArticle.kind} · {selectedArticle.id}
                  </Text>
                </div>
                <div>
                  <Text className='text-12px'>正文</Text>
                  <pre className='mt-4px whitespace-pre-wrap text-12px bg-[var(--color-fill-1)] p-12px rounded-6px max-h-420px overflow-auto'>
                    {selectedArticle.body_md}
                  </pre>
                </div>
                {selectedArticle.source_conversation_ids.length ? (
                  <Text type='secondary' className='text-12px'>
                    来源会话：{selectedArticle.source_conversation_ids.join(', ')}
                  </Text>
                ) : null}
                {selectedArticle.tags.length ? (
                  <Text type='secondary' className='text-12px'>
                    标签：{selectedArticle.tags.join(', ')}
                  </Text>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : (
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
                  <div className='mt-8px flex gap-8px flex-wrap' onClick={(e) => e.stopPropagation()}>
                    {item.status === 'draft' || item.status === 'pending_review' ? (
                      <Button size='mini' loading={busy} onClick={() => void runAction(item.id, 'evolve')}>
                        重新智能提炼
                      </Button>
                    ) : null}
                    {item.status === 'draft' ? (
                      <Button size='mini' loading={busy} onClick={() => void runAction(item.id, 'submit')}>
                        提交审核
                      </Button>
                    ) : null}
                    {item.status === 'pending_review' || item.status === 'draft' ? (
                      <>
                        <Button
                          size='mini'
                          type='primary'
                          loading={busy}
                          onClick={() => void runAction(item.id, 'approve')}
                        >
                          通过
                        </Button>
                        <Button
                          size='mini'
                          status='danger'
                          loading={busy}
                          onClick={() => void runAction(item.id, 'reject')}
                        >
                          拒绝
                        </Button>
                      </>
                    ) : null}
                    {item.status === 'approved' ? (
                      <Button
                        size='mini'
                        type='primary'
                        loading={busy}
                        onClick={() => void runAction(item.id, 'apply')}
                      >
                        写入 Skills Hub
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
                {selected.experience_article_ids.length ? (
                  <Text type='secondary' className='text-12px'>
                    关联经验库：{selected.experience_article_ids.join(', ')}
                  </Text>
                ) : null}
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
                {applyPaths ? (
                  <Text type='success' className='text-12px'>
                    {applyPaths}
                  </Text>
                ) : null}
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
      )}
    </div>
  );
};

export default SkillEvolutionListPage;
