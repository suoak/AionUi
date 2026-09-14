import { Button, Input, Message, Select, Tabs, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type {
  ExperienceArticle,
  SkillEvolutionGateMode,
  SkillEvolutionProposal,
  SkillEvolutionSettings,
  SkillEvolutionStatus,
} from '@/common/types/agent/skillEvolutionTypes';
import { formatAgentCenterError } from '../agent-center/agentCenterErrors';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

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

const visibilityLabel: Record<string, string> = {
  private: '私有',
  team: '团队',
  owner_editors: '仅所有者/编辑',
};

const gateModeLabel: Record<string, string> = {
  human_only: '仅人工审核（默认）',
  heuristic_assist: '启发式辅助提交',
  auto_apply_on_pass: '高分自动应用（危险）',
};

type Filter = 'all' | 'pending_review' | 'draft' | 'approved' | 'applied' | 'rejected' | 'experience' | 'settings';

const renderGateBadge = (item: SkillEvolutionProposal) => {
  if (item.gate_score == null) return null;
  const rec = item.gate_recommendation ?? 'needs_review';
  const color =
    rec === 'approve'
      ? 'var(--color-success-6)'
      : rec === 'reject'
        ? 'var(--color-danger-6)'
        : 'var(--color-warning-6)';
  return (
    <span className='text-12px ml-8px' style={{ color }}>
      门控 {item.gate_score}
      {rec === 'approve' ? ' · 建议通过' : rec === 'reject' ? ' · 建议拒绝' : ' · 需复核'}
    </span>
  );
};

const SkillEvolutionListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const assistantFilter = searchParams.get('assistant_id') || '';
  const [filter, setFilter] = useState<Filter>('pending_review');
  const [experienceCount, setExperienceCount] = useState(0);
  const [items, setItems] = useState<SkillEvolutionProposal[]>([]);
  const [experience, setExperience] = useState<ExperienceArticle[]>([]);
  const [visibilityFilter, setVisibilityFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SkillEvolutionProposal | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<ExperienceArticle | null>(null);
  const [comment, setComment] = useState('');
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const [applyPaths, setApplyPaths] = useState<string | null>(null);
  const [settings, setSettings] = useState<SkillEvolutionSettings | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [crossNotes, setCrossNotes] = useState<{ title: string; body_md: string }[]>([]);
  const [message, messageContext] = Message.useMessage({ maxCount: 5 });
  const messageRef = useRef(message);
  messageRef.current = message;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const aid = assistantFilter || undefined;
      const exp = await ipcBridge.skillEvolution.listExperience.invoke({
        assistant_id: aid,
        visibility: visibilityFilter === 'all' ? undefined : visibilityFilter,
        limit: 100,
      });
      setExperienceCount(exp.length);
      if (filter === 'experience') {
        setExperience(exp);
      } else if (filter === 'settings') {
        const [s, notes] = await Promise.all([
          ipcBridge.skillEvolution.getSettings.invoke(),
          ipcBridge.skillEvolution.crossModelNotes.invoke().catch((): { title: string; body_md: string }[] => []),
        ]);
        setSettings(s);
        setCrossNotes(notes);
      } else {
        const list = await ipcBridge.skillEvolution.listProposals.invoke({
          status: filter === 'all' ? undefined : filter,
          assistant_id: aid,
          limit: 100,
        });
        setItems(list);
      }
    } catch (error) {
      console.error(error);
      const msg = formatAgentCenterError(error, '加载失败（技能进化为独立模块，需 Core 含技能进化 API）');
      messageRef.current.error(msg);
    } finally {
      setLoading(false);
    }
  }, [filter, assistantFilter, visibilityFilter]);

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
      messageRef.current.error('加载提案详情失败');
    }
  };

  const saveSettings = async (patch: Partial<SkillEvolutionSettings>) => {
    setSettingsBusy(true);
    try {
      const next = await ipcBridge.skillEvolution.updateSettings.invoke({
        gate_mode: (patch.gate_mode ?? settings?.gate_mode) as SkillEvolutionGateMode | undefined,
        assist_threshold: patch.assist_threshold ?? settings?.assist_threshold,
        auto_threshold: patch.auto_threshold ?? settings?.auto_threshold,
        default_experience_visibility: (patch.default_experience_visibility ??
          settings?.default_experience_visibility) as 'private' | 'team' | 'owner_editors' | undefined,
      });
      setSettings(next);
      messageRef.current.success('门控设置已保存');
    } catch (error) {
      console.error(error);
      messageRef.current.error(formatAgentCenterError(error, '保存设置失败'));
    } finally {
      setSettingsBusy(false);
    }
  };

  const runAction = async (id: string, action: 'submit' | 'approve' | 'reject' | 'apply' | 'rollback' | 'evolve') => {
    setBusyId(id);
    try {
      if (action === 'submit') {
        await ipcBridge.skillEvolution.submitProposal.invoke({ id });
        messageRef.current.success('已提交审核');
      } else if (action === 'approve') {
        const res = await ipcBridge.skillEvolution.approveProposal.invoke({ id, comment: comment || undefined });
        setExportPreview(res.export.skill_md);
        messageRef.current.success(`已通过，可应用到 ${res.export.suggested_path}`);
      } else if (action === 'reject') {
        await ipcBridge.skillEvolution.rejectProposal.invoke({ id, comment: comment || undefined });
        messageRef.current.success('已拒绝，经验库已记录');
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
        const aid = res.proposal.assistant_id;
        messageRef.current.success({
          content: (
            <span>
              {parts.length ? `已写入并应用：${parts.join('；')}` : '已标记应用'}。下一步：
              {aid ? (
                <>
                  <a
                    className='ml-4px'
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/agent-center/${aid}`);
                    }}
                  >
                    查看智能体
                  </a>
                  {' / '}
                  <a
                    className='ml-4px'
                    onClick={(e) => {
                      e.preventDefault();
                      void (async () => {
                        try {
                          const plan = await ipcBridge.agentCenter.run.invoke({ id: aid });
                          navigate('/guid', {
                            state: {
                              selectedAssistantId: plan.assistant_id,
                              agentCenterRunPlan: plan.create_conversation,
                              agentCenterPreviewMode: plan.preview_mode,
                              focusPrefill: true,
                            },
                          });
                        } catch {
                          navigate(`/agent-center/${aid}`);
                        }
                      })();
                    }}
                  >
                    试跑
                  </a>
                  {' / '}
                  <a
                    className='ml-4px'
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/agent-center/${aid}/edit`, { state: { focusStep: 4 } });
                    }}
                  >
                    发布 pin
                  </a>
                </>
              ) : (
                '可在智能体中心绑定技能后试跑 / 发布'
              )}
            </span>
          ),
          duration: 8000,
        });
      } else if (action === 'evolve') {
        const res = await ipcBridge.skillEvolution.evolveProposal.invoke({ id, submit: false });
        setSelected(res.proposal);
        setExportPreview(res.proposal.draft_skill_md);
        messageRef.current.success(
          `已重新智能提炼${res.model_used ? `（${res.model_used}）` : ''}${res.gate_note ? ` · ${res.gate_note}` : ''}`
        );
      } else {
        await ipcBridge.skillEvolution.rollbackProposal.invoke({ id, comment: comment || undefined });
        messageRef.current.success('已回滚技能指针（经验库保留）');
      }
      await load();
      if (action !== 'evolve') {
        await openDetail(id);
      }
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : '操作失败';
      messageRef.current.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const copyExport = async () => {
    if (!exportPreview) return;
    try {
      await navigator.clipboard.writeText(exportPreview);
      messageRef.current.success('SKILL.md 已复制到剪贴板');
    } catch {
      messageRef.current.error('复制失败');
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
            从会话经验提炼 SKILL.md 提案 → 启发式门控（可配置）→ 人工审核 → 写入 Skills Hub /
            pin。经验库仅用于技能进化，不会注入日常对话；知识库产品保持独立。
            {experienceCount > 0 ? ` · 经验库 ${experienceCount} 篇` : ''}
          </Text>
          {assistantFilter ? (
            <div className='mt-8px flex items-center gap-8px'>
              <Text type='secondary' className='text-12px'>
                已按智能体筛选：{assistantFilter.slice(0, 12)}…
              </Text>
              <Button
                size='mini'
                type='text'
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete('assistant_id');
                  setSearchParams(next);
                }}
              >
                清除筛选
              </Button>
              <Button size='mini' type='text' onClick={() => navigate(`/agent-center/${assistantFilter}`)}>
                打开智能体详情
              </Button>
            </div>
          ) : null}
        </div>
        <div className='flex gap-8px'>
          <Button
            type='primary'
            onClick={() =>
              navigate(
                assistantFilter
                  ? `/skill-evolution/new?assistant_id=${encodeURIComponent(assistantFilter)}`
                  : '/skill-evolution/new'
              )
            }
          >
            从会话提炼技能
          </Button>
        </div>
      </div>

      <Tabs activeTab={filter} onChange={(key) => setFilter(key as Filter)}>
        <TabPane key='pending_review' title='待审核' />
        <TabPane key='draft' title='草稿' />
        <TabPane key='approved' title='已通过' />
        <TabPane key='applied' title='已应用' />
        <TabPane key='rejected' title='已拒绝' />
        <TabPane key='experience' title={`经验库${experienceCount ? ` (${experienceCount})` : ''}`} />
        <TabPane key='settings' title='门控设置' />
        <TabPane key='all' title='全部提案' />
      </Tabs>

      {filter === 'settings' ? (
        <div className='mt-16px max-w-720px flex flex-col gap-16px'>
          <Text type='secondary' className='text-12px'>
            默认「仅人工审核」。启发式分数仅作建议；「自动应用」需显式开启，高分通过后仍写
            skill_impact，并可一键回滚。经验库永不注入日常对话。
          </Text>
          {!settings && loading ? <Text type='secondary'>加载中…</Text> : null}
          {settings ? (
            <>
              <div>
                <Text className='text-12px'>门控模式</Text>
                <Select
                  className='mt-4px w-full'
                  value={settings.gate_mode}
                  disabled={settingsBusy}
                  onChange={(v) => {
                    if (v === 'auto_apply_on_pass') {
                      messageRef.current.warning(
                        '警告：自动应用会在高分时跳过人工点击通过/写入。请确认企业策略允许，并保留回滚习惯。'
                      );
                    }
                    void saveSettings({ gate_mode: v });
                  }}
                  options={Object.entries(gateModeLabel).map(([value, label]) => ({ value, label }))}
                />
              </div>
              <div className='flex gap-16px flex-wrap'>
                <div>
                  <Text className='text-12px'>辅助提交阈值（heuristic_assist）</Text>
                  <Input
                    className='mt-4px w-120px'
                    type='number'
                    value={String(settings.assist_threshold)}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isNaN(n)) void saveSettings({ assist_threshold: n });
                    }}
                    onChange={(v) => setSettings({ ...settings, assist_threshold: Number(v) || 0 })}
                  />
                </div>
                <div>
                  <Text className='text-12px'>自动应用阈值（auto_apply_on_pass）</Text>
                  <Input
                    className='mt-4px w-120px'
                    type='number'
                    value={String(settings.auto_threshold)}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isNaN(n)) void saveSettings({ auto_threshold: n });
                    }}
                    onChange={(v) => setSettings({ ...settings, auto_threshold: Number(v) || 0 })}
                  />
                </div>
              </div>
              <div>
                <Text className='text-12px'>新建经验默认可见性</Text>
                <Select
                  className='mt-4px w-full'
                  value={settings.default_experience_visibility}
                  disabled={settingsBusy}
                  onChange={(v) => void saveSettings({ default_experience_visibility: v })}
                  options={Object.entries(visibilityLabel).map(([value, label]) => ({ value, label }))}
                />
              </div>
            </>
          ) : null}
          {crossNotes.length ? (
            <div className='mt-8px'>
              <Title heading={6}>跨模型迁移提示（轻量）</Title>
              {crossNotes.map((n) => (
                <div key={n.title} className='mb-12px rounded-8px border border-[var(--color-border-2)] p-12px'>
                  <div className='font-medium'>{n.title}</div>
                  <pre className='mt-4px whitespace-pre-wrap text-12px'>{n.body_md}</pre>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : filter === 'experience' ? (
        <div className='mt-16px grid grid-cols-1 lg:grid-cols-2 gap-16px'>
          <div className='flex flex-col gap-12px'>
            <div className='flex items-center gap-8px'>
              <Text type='secondary' className='text-12px'>
                经验库仅用于技能进化，不会注入日常对话。
              </Text>
              <Select
                size='small'
                style={{ width: 140 }}
                value={visibilityFilter}
                onChange={setVisibilityFilter}
                options={[
                  { value: 'all', label: '全部可见性' },
                  { value: 'private', label: '私有' },
                  { value: 'team', label: '团队' },
                  { value: 'owner_editors', label: '所有者/编辑' },
                ]}
              />
            </div>
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
                <div className='font-medium truncate flex items-center gap-8px'>
                  <span className='truncate'>{item.title}</span>
                  {item.visibility === 'team' ? (
                    <span className='text-11px px-6px py-1px rounded-4px bg-[var(--color-primary-light-1)] text-[var(--color-primary-6)] shrink-0'>
                      团队
                    </span>
                  ) : null}
                </div>
                <Text type='secondary' className='text-12px'>
                  {kindLabel[item.kind] ?? item.kind} ·{' '}
                  {visibilityLabel[item.visibility ?? 'private'] ?? item.visibility} · {item.id.slice(0, 10)}…
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
                    {kindLabel[selectedArticle.kind] ?? selectedArticle.kind} ·{' '}
                    {visibilityLabel[selectedArticle.visibility ?? 'private'] ?? selectedArticle.visibility} ·{' '}
                    {selectedArticle.id}
                    {selectedArticle.team_id ? ` · team ${selectedArticle.team_id.slice(0, 8)}…` : ''}
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
                    {renderGateBadge(item)}
                  </Text>
                  <div className='mt-8px flex gap-8px flex-wrap' onClick={(e) => e.stopPropagation()}>
                    {item.status === 'draft' || item.status === 'pending_review' || item.status === 'rejected' ? (
                      <Button size='mini' loading={busy} onClick={() => void runAction(item.id, 'evolve')}>
                        再次智能提炼
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
                    {renderGateBadge(selected)}
                  </Text>
                </div>
                {selected.gate_signals && selected.gate_signals.length ? (
                  <div>
                    <Text className='text-12px'>启发式门控信号</Text>
                    <ul className='mt-4px text-12px list-disc pl-18px'>
                      {selected.gate_signals.map((s) => (
                        <li key={s.id} style={{ color: s.passed ? 'inherit' : 'var(--color-danger-6)' }}>
                          {s.passed ? '✓' : '✗'} {s.detail}（权重 {s.weight}）
                        </li>
                      ))}
                    </ul>
                    <Text type='secondary' className='text-11px'>
                      模式：{gateModeLabel[selected.gate_mode ?? 'human_only'] ?? selected.gate_mode}
                    </Text>
                  </div>
                ) : null}
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
