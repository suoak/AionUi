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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

const { Title, Text } = Typography;
const TabPane = Tabs.TabPane;
const TextArea = Input.TextArea;

type TFn = (key: string, options?: Record<string, unknown>) => string;

const STATUSES: SkillEvolutionStatus[] = ['draft', 'pending_review', 'approved', 'rejected', 'applied', 'rolled_back'];
const KINDS = ['pattern', 'skill_impact', 'rejected_note', 'index', 'general'];
const VISIBILITIES = ['private', 'team', 'owner_editors'];
const GATE_MODES = ['human_only', 'heuristic_assist', 'auto_apply_on_pass'];

const labelMap = (t: TFn, group: string, keys: readonly string[]): Record<string, string> =>
  Object.fromEntries(keys.map((key) => [key, t(`agent.skillEvolution.${group}.${key}`)]));

type Filter = 'all' | 'pending_review' | 'draft' | 'approved' | 'applied' | 'rejected' | 'experience' | 'settings';

const renderGateBadge = (item: SkillEvolutionProposal, t: TFn) => {
  if (item.gate_score == null) return null;
  const rec = item.gate_recommendation ?? 'needs_review';
  const color =
    rec === 'approve'
      ? 'var(--color-success-6)'
      : rec === 'reject'
        ? 'var(--color-danger-6)'
        : 'var(--color-warning-6)';
  const advice = rec === 'approve' ? 'approve' : rec === 'reject' ? 'reject' : 'review';
  return (
    <span className='text-12px ml-8px' style={{ color }}>
      {t('agent.skillEvolution.gate.score', { score: item.gate_score })} · {t(`agent.skillEvolution.gate.${advice}`)}
    </span>
  );
};

const SkillEvolutionListPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const statusLabel = useMemo(() => labelMap(t, 'status', STATUSES), [t]);
  const kindLabel = useMemo(() => labelMap(t, 'kind', KINDS), [t]);
  const visibilityLabel = useMemo(() => labelMap(t, 'visibility', VISIBILITIES), [t]);
  const gateModeLabel = useMemo(() => labelMap(t, 'gateMode', GATE_MODES), [t]);
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
      const msg = formatAgentCenterError(error, t('agent.skillEvolution.errors.load'));
      messageRef.current.error(msg);
    } finally {
      setLoading(false);
    }
  }, [filter, assistantFilter, visibilityFilter, t]);

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
      messageRef.current.error(t('agent.skillEvolution.errors.loadDetail'));
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
      messageRef.current.success(t('agent.skillEvolution.toast.settingsSaved'));
    } catch (error) {
      console.error(error);
      messageRef.current.error(formatAgentCenterError(error, t('agent.skillEvolution.errors.saveSettings')));
    } finally {
      setSettingsBusy(false);
    }
  };

  const runAction = async (id: string, action: 'submit' | 'approve' | 'reject' | 'apply' | 'rollback' | 'evolve') => {
    setBusyId(id);
    try {
      if (action === 'submit') {
        await ipcBridge.skillEvolution.submitProposal.invoke({ id });
        messageRef.current.success(t('agent.skillEvolution.toast.submitted'));
      } else if (action === 'approve') {
        const res = await ipcBridge.skillEvolution.approveProposal.invoke({ id, comment: comment || undefined });
        setExportPreview(res.export.skill_md);
        messageRef.current.success(t('agent.skillEvolution.toast.approved', { path: res.export.suggested_path }));
      } else if (action === 'reject') {
        await ipcBridge.skillEvolution.rejectProposal.invoke({ id, comment: comment || undefined });
        messageRef.current.success(t('agent.skillEvolution.toast.rejected'));
      } else if (action === 'apply') {
        const res = await ipcBridge.skillEvolution.applyProposal.invoke({
          id,
          write_to_skills_hub: true,
          pin_on_assistant: true,
        });
        setExportPreview(res.export.skill_md);
        const parts = [
          res.skills_hub_path ? `Skills Hub: ${res.skills_hub_path}` : null,
          res.workspace_skill_path
            ? t('agent.skillEvolution.toast.workspacePath', { path: res.workspace_skill_path })
            : null,
          res.skill_ref
            ? t('agent.skillEvolution.toast.pinned', {
                ref: `${res.skill_ref.skill_key}@${res.skill_ref.pinned_version ?? 'pin'}`,
              })
            : null,
        ].filter(Boolean);
        setApplyPaths(parts.join(' · ') || res.export.suggested_path);
        const aid = res.proposal.assistant_id;
        messageRef.current.success({
          content: (
            <span>
              {parts.length
                ? t('agent.skillEvolution.toast.appliedTo', { parts: parts.join(' · ') })
                : t('agent.skillEvolution.toast.appliedMarked')}{' '}
              {t('agent.skillEvolution.toast.nextStep')}
              {aid ? (
                <>
                  <a
                    className='ml-4px'
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/agents/${aid}`);
                    }}
                  >
                    {t('agent.skillEvolution.toast.viewAgent')}
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
                          navigate(`/agents/${aid}`);
                        }
                      })();
                    }}
                  >
                    {t('agent.skillEvolution.toast.tryRun')}
                  </a>
                  {' / '}
                  <a
                    className='ml-4px'
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/agents/${aid}/edit`, { state: { focusStep: 4 } });
                    }}
                  >
                    {t('agent.skillEvolution.toast.publishPin')}
                  </a>
                </>
              ) : (
                t('agent.skillEvolution.toast.bindHint')
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
          [t('agent.skillEvolution.toast.evolved'), res.model_used, res.gate_note].filter(Boolean).join(' · ')
        );
      } else {
        await ipcBridge.skillEvolution.rollbackProposal.invoke({ id, comment: comment || undefined });
        messageRef.current.success(t('agent.skillEvolution.toast.rolledBack'));
      }
      await load();
      if (action !== 'evolve') {
        await openDetail(id);
      }
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : t('agent.skillEvolution.errors.action');
      messageRef.current.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const copyExport = async () => {
    if (!exportPreview) return;
    try {
      await navigator.clipboard.writeText(exportPreview);
      messageRef.current.success(t('agent.skillEvolution.toast.copied'));
    } catch {
      messageRef.current.error(t('agent.skillEvolution.errors.copy'));
    }
  };

  return (
    <div className='h-full overflow-auto p-24px'>
      {messageContext}
      <div className='flex items-center justify-between mb-16px gap-12px flex-wrap'>
        <div>
          <Title heading={4} className='!mb-4px'>
            {t('agent.skillEvolution.page.title')}
          </Title>
          <Text type='secondary'>
            {t('agent.skillEvolution.page.description')}
            {experienceCount > 0
              ? ` · ${t('agent.skillEvolution.page.experienceCount', { count: experienceCount })}`
              : ''}
          </Text>
          {assistantFilter ? (
            <div className='mt-8px flex items-center gap-8px'>
              <Text type='secondary' className='text-12px'>
                {t('agent.skillEvolution.page.filteredByAgent', { id: assistantFilter.slice(0, 12) })}
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
                {t('agent.skillEvolution.page.clearFilter')}
              </Button>
              <Button size='mini' type='text' onClick={() => navigate(`/agents/${assistantFilter}`)}>
                {t('agent.skillEvolution.page.openAgent')}
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
            {t('agent.skillEvolution.page.distill')}
          </Button>
        </div>
      </div>

      <Tabs activeTab={filter} onChange={(key) => setFilter(key as Filter)}>
        <TabPane key='pending_review' title={statusLabel.pending_review} />
        <TabPane key='draft' title={statusLabel.draft} />
        <TabPane key='approved' title={statusLabel.approved} />
        <TabPane key='applied' title={statusLabel.applied} />
        <TabPane key='rejected' title={statusLabel.rejected} />
        <TabPane
          key='experience'
          title={
            experienceCount
              ? t('agent.skillEvolution.tabs.experienceCount', { count: experienceCount })
              : t('agent.skillEvolution.tabs.experience')
          }
        />
        <TabPane key='settings' title={t('agent.skillEvolution.tabs.settings')} />
        <TabPane key='all' title={t('agent.skillEvolution.tabs.all')} />
      </Tabs>

      {filter === 'settings' ? (
        <div className='mt-16px max-w-720px flex flex-col gap-16px'>
          <Text type='secondary' className='text-12px'>
            {t('agent.skillEvolution.settings.intro')}
          </Text>
          {!settings && loading ? <Text type='secondary'>{t('agent.skillEvolution.settings.loading')}</Text> : null}
          {settings ? (
            <>
              <div>
                <Text className='text-12px'>{t('agent.skillEvolution.settings.gateMode')}</Text>
                <Select
                  className='mt-4px w-full'
                  value={settings.gate_mode}
                  disabled={settingsBusy}
                  onChange={(v) => {
                    if (v === 'auto_apply_on_pass') {
                      messageRef.current.warning(t('agent.skillEvolution.settings.autoApplyWarning'));
                    }
                    void saveSettings({ gate_mode: v });
                  }}
                  options={Object.entries(gateModeLabel).map(([value, label]) => ({ value, label }))}
                />
              </div>
              <div className='flex gap-16px flex-wrap'>
                <div>
                  <Text className='text-12px'>{t('agent.skillEvolution.settings.assistThreshold')}</Text>
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
                  <Text className='text-12px'>{t('agent.skillEvolution.settings.autoThreshold')}</Text>
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
                <Text className='text-12px'>{t('agent.skillEvolution.settings.defaultVisibility')}</Text>
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
              <Title heading={6}>{t('agent.skillEvolution.settings.crossModel')}</Title>
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
                {t('agent.skillEvolution.experience.intro')}
              </Text>
              <Select
                size='small'
                style={{ width: 140 }}
                value={visibilityFilter}
                onChange={setVisibilityFilter}
                options={[
                  { value: 'all', label: t('agent.skillEvolution.visibility.all') },
                  ...VISIBILITIES.map((value) => ({ value, label: visibilityLabel[value] })),
                ]}
              />
            </div>
            {loading && <Text type='secondary'>{t('agent.skillEvolution.settings.loading')}</Text>}
            {!loading && experience.length === 0 && (
              <Text type='secondary'>{t('agent.skillEvolution.experience.empty')}</Text>
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
                      {visibilityLabel.team}
                    </span>
                  ) : null}
                </div>
                <Text type='secondary' className='text-12px'>
                  {kindLabel[item.kind] ?? item.kind} ·{' '}
                  {visibilityLabel[item.visibility ?? 'private'] ?? item.visibility} · {item.id.slice(0, 10)}…
                  {item.source_conversation_ids[0]
                    ? ` · ${t('agent.skillEvolution.experience.conversation', { id: item.source_conversation_ids[0].slice(0, 8) })}`
                    : ''}
                </Text>
              </div>
            ))}
          </div>
          <div className='rounded-8px border border-[var(--color-border-2)] p-16px min-h-320px'>
            {!selectedArticle ? (
              <Text type='secondary'>{t('agent.skillEvolution.experience.pickHint')}</Text>
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
                  <Text className='text-12px'>{t('agent.skillEvolution.experience.body')}</Text>
                  <pre className='mt-4px whitespace-pre-wrap text-12px bg-[var(--color-fill-1)] p-12px rounded-6px max-h-420px overflow-auto'>
                    {selectedArticle.body_md}
                  </pre>
                </div>
                {selectedArticle.source_conversation_ids.length ? (
                  <Text type='secondary' className='text-12px'>
                    {t('agent.skillEvolution.experience.sources', {
                      ids: selectedArticle.source_conversation_ids.join(', '),
                    })}
                  </Text>
                ) : null}
                {selectedArticle.tags.length ? (
                  <Text type='secondary' className='text-12px'>
                    {t('agent.skillEvolution.experience.tags', { tags: selectedArticle.tags.join(', ') })}
                  </Text>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className='mt-16px grid grid-cols-1 lg:grid-cols-2 gap-16px'>
          <div className='flex flex-col gap-12px'>
            {loading && <Text type='secondary'>{t('agent.skillEvolution.settings.loading')}</Text>}
            {!loading && items.length === 0 && (
              <Text type='secondary'>{t('agent.skillEvolution.proposals.empty')}</Text>
            )}
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
                    {statusLabel[item.status]} ·{' '}
                    {item.target_skill_key ?? t('agent.skillEvolution.proposals.untitledSkill')}
                    {item.conversation_id
                      ? ` · ${t('agent.skillEvolution.experience.conversation', { id: item.conversation_id.slice(0, 8) })}`
                      : ''}
                    {renderGateBadge(item, t)}
                  </Text>
                  <div className='mt-8px flex gap-8px flex-wrap' onClick={(e) => e.stopPropagation()}>
                    {item.status === 'draft' || item.status === 'pending_review' || item.status === 'rejected' ? (
                      <Button size='mini' loading={busy} onClick={() => void runAction(item.id, 'evolve')}>
                        {t('agent.skillEvolution.proposals.evolveAgain')}
                      </Button>
                    ) : null}
                    {item.status === 'draft' ? (
                      <Button size='mini' loading={busy} onClick={() => void runAction(item.id, 'submit')}>
                        {t('agent.skillEvolution.proposals.submit')}
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
                          {t('agent.skillEvolution.proposals.approve')}
                        </Button>
                        <Button
                          size='mini'
                          status='danger'
                          loading={busy}
                          onClick={() => void runAction(item.id, 'reject')}
                        >
                          {t('agent.skillEvolution.proposals.reject')}
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
                        {t('agent.skillEvolution.proposals.writeHub')}
                      </Button>
                    ) : null}
                    {item.status === 'applied' || item.status === 'approved' ? (
                      <Button size='mini' loading={busy} onClick={() => void runAction(item.id, 'rollback')}>
                        {t('agent.skillEvolution.proposals.rollback')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className='rounded-8px border border-[var(--color-border-2)] p-16px min-h-320px'>
            {!selected ? (
              <Text type='secondary'>{t('agent.skillEvolution.proposals.pickHint')}</Text>
            ) : (
              <div className='flex flex-col gap-12px'>
                <div>
                  <div className='font-medium text-16px'>{selected.title}</div>
                  <Text type='secondary' className='text-12px'>
                    {statusLabel[selected.status]} · {selected.id}
                    {renderGateBadge(selected, t)}
                  </Text>
                </div>
                {selected.gate_signals && selected.gate_signals.length ? (
                  <div>
                    <Text className='text-12px'>{t('agent.skillEvolution.proposals.signals')}</Text>
                    <ul className='mt-4px text-12px list-disc pl-18px'>
                      {selected.gate_signals.map((s) => (
                        <li key={s.id} style={{ color: s.passed ? 'inherit' : 'var(--color-danger-6)' }}>
                          {s.passed ? '✓' : '✗'} {s.detail}{' '}
                          {t('agent.skillEvolution.proposals.signalWeight', { weight: s.weight })}
                        </li>
                      ))}
                    </ul>
                    <Text type='secondary' className='text-11px'>
                      {t('agent.skillEvolution.proposals.mode', {
                        mode: gateModeLabel[selected.gate_mode ?? 'human_only'] ?? selected.gate_mode,
                      })}
                    </Text>
                  </div>
                ) : null}
                <div>
                  <Text className='text-12px'>{t('agent.skillEvolution.proposals.summary')}</Text>
                  <pre className='mt-4px whitespace-pre-wrap text-13px bg-[var(--color-fill-1)] p-12px rounded-6px max-h-160px overflow-auto'>
                    {selected.experience_summary || t('agent.skillEvolution.proposals.emptyValue')}
                  </pre>
                </div>
                {selected.experience_article_ids.length ? (
                  <Text type='secondary' className='text-12px'>
                    {t('agent.skillEvolution.proposals.linkedExperience', {
                      ids: selected.experience_article_ids.join(', '),
                    })}
                  </Text>
                ) : null}
                <div>
                  <Text className='text-12px'>{t('agent.skillEvolution.proposals.draft')}</Text>
                  <pre className='mt-4px whitespace-pre-wrap text-12px bg-[var(--color-fill-1)] p-12px rounded-6px max-h-280px overflow-auto'>
                    {selected.draft_skill_md}
                  </pre>
                </div>
                <div>
                  <Text className='text-12px'>{t('agent.skillEvolution.proposals.comment')}</Text>
                  <TextArea
                    className='mt-4px'
                    value={comment}
                    onChange={setComment}
                    placeholder={t('agent.skillEvolution.proposals.commentPlaceholder')}
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
                      <Text className='text-12px'>{t('agent.skillEvolution.proposals.exportPreview')}</Text>
                      <Button size='mini' onClick={() => void copyExport()}>
                        {t('agent.skillEvolution.proposals.copySkill')}
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
