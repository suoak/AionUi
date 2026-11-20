import { Button, Input, Message, Select, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { ExperienceVisibility, SkillEvolutionTrajectoryOverview } from '@/common/types/agent/skillEvolutionTypes';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

const { Title, Text } = Typography;
const TextArea = Input.TextArea;

const SkillEvolutionCreatePage: React.FC = () => {
  const { t } = useTranslation();
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
  const [visibility, setVisibility] = useState<ExperienceVisibility>('private');
  const [teamId, setTeamId] = useState('');
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
      label: `${c.name || t('agent.skillEvolution.create.untitled')} (${c.id.slice(0, 8)}…)`,
      value: c.id,
    }));
  }, [conversations, assistantId, t]);

  const handleEvolve = async () => {
    if (!conversationId.trim()) {
      message.error(t('agent.skillEvolution.create.needConversation'));
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
        visibility,
        team_id: visibility === 'team' ? teamId.trim() || undefined : undefined,
      });
      setTitle(res.proposal.title);
      setSummary(res.proposal.experience_summary);
      setSkillKey(res.proposal.target_skill_key ?? '');
      setDraftMd(res.proposal.draft_skill_md);
      setOverview(res.trajectory_overview);
      setModelUsed(res.model_used ?? null);
      message.success(
        [
          t('agent.skillEvolution.create.evolved', { count: res.experience_articles.length }),
          res.model_used ? t('agent.skillEvolution.create.evolvedModel', { model: res.model_used }) : null,
          res.gate_note,
        ]
          .filter(Boolean)
          .join(' · ')
      );
      navigate(assistantId ? `/skill-evolution?assistant_id=${encodeURIComponent(assistantId)}` : '/skill-evolution', {
        state: { highlightId: res.proposal.id },
      });
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : '';
      // Core's own model errors are shown as they are; anything else gets the hint.
      message.error(/model|\u6a21\u578b/i.test(msg) ? msg : t('agent.skillEvolution.create.evolveFailed'));
    } finally {
      setEvolving(false);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      message.error(t('agent.skillEvolution.create.needTitle'));
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
        visibility,
        team_id: visibility === 'team' ? teamId.trim() || undefined : undefined,
        action: 'create',
      });
      message.success(
        submitNow ? t('agent.skillEvolution.create.createdSubmitted') : t('agent.skillEvolution.create.draftSaved')
      );
      navigate('/skill-evolution', { state: { highlightId: created.id } });
    } catch (error) {
      console.error(error);
      message.error(t('agent.skillEvolution.create.createFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='h-full overflow-auto p-24px max-w-880px'>
      {messageContext}
      <Button type='text' className='!px-0 mb-8px' onClick={() => navigate('/skill-evolution')}>
        {t('agent.skillEvolution.create.back')}
      </Button>
      <Title heading={4} className='!mb-4px'>
        {t('agent.skillEvolution.page.distill')}
      </Title>
      <Text type='secondary' className='block mb-16px'>
        {t('agent.skillEvolution.create.intro')}
      </Text>

      <div className='flex flex-col gap-12px'>
        <div>
          <Text className='text-12px'>{t('agent.skillEvolution.create.pickConversation')}</Text>
          <Select
            className='mt-4px w-full'
            allowClear
            showSearch
            placeholder={t('agent.skillEvolution.create.pickPlaceholder')}
            options={conversationOptions}
            value={conversationId || undefined}
            onChange={(v) => setConversationId((v as string) ?? '')}
          />
          {!conversationOptions.length ? (
            <Text type='secondary' className='text-12px mt-4px block'>
              {t('agent.skillEvolution.create.pasteHint')}
            </Text>
          ) : null}
          <Input
            className='mt-8px'
            value={conversationId}
            onChange={setConversationId}
            placeholder={t('agent.skillEvolution.create.pastePlaceholder')}
          />
        </div>

        {overview ? (
          <div className='rounded-8px border border-[var(--color-border-2)] p-12px bg-[var(--color-fill-1)]'>
            <Text className='text-12px font-medium'>{t('agent.skillEvolution.create.overview')}</Text>
            <Text type='secondary' className='text-12px block mt-4px'>
              {overview.conversation_name ? `${overview.conversation_name} · ` : ''}
              turns {overview.turns} · steps {overview.steps} · tools {overview.tools} · errors {overview.errors}
              {overview.record_count ? ` · records ${overview.record_count}` : ''}
            </Text>
            {modelUsed ? (
              <Text type='secondary' className='text-12px block mt-4px'>
                {t('agent.skillEvolution.create.lastModel', { model: modelUsed })}
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
            {t('agent.skillEvolution.create.evolve')}
          </Button>
          <Text type='secondary' className='text-12px self-center'>
            {t('agent.skillEvolution.create.evolveHint')}
          </Text>
        </div>

        <div>
          <Text className='text-12px'>{t('agent.skillEvolution.create.titleLabel')}</Text>
          <Input
            className='mt-4px'
            value={title}
            onChange={setTitle}
            placeholder={t('agent.skillEvolution.create.titlePlaceholder')}
          />
        </div>
        <div>
          <Text className='text-12px'>{t('agent.skillEvolution.create.assistantLabel')}</Text>
          <Input className='mt-4px' value={assistantId} onChange={setAssistantId} placeholder='assistant id' />
        </div>
        <div>
          <Text className='text-12px'>{t('agent.skillEvolution.create.visibilityLabel')}</Text>
          <Select
            className='mt-4px w-full'
            value={visibility}
            onChange={(v) => setVisibility(v as ExperienceVisibility)}
            options={[
              { value: 'private', label: t('agent.skillEvolution.create.visibilityPrivate') },
              { value: 'team', label: t('agent.skillEvolution.create.visibilityTeam') },
              { value: 'owner_editors', label: t('agent.skillEvolution.visibility.owner_editors') },
            ]}
          />
        </div>
        {visibility === 'team' ? (
          <div>
            <Text className='text-12px'>{t('agent.skillEvolution.create.teamId')}</Text>
            <Input
              className='mt-4px'
              value={teamId}
              onChange={setTeamId}
              placeholder={t('agent.skillEvolution.create.teamIdPlaceholder')}
            />
          </div>
        ) : null}
        <div>
          <Text className='text-12px'>{t('agent.skillEvolution.create.skillKey')}</Text>
          <Input className='mt-4px' value={skillKey} onChange={setSkillKey} placeholder='workmate-weekly-report' />
        </div>
        <div>
          <Text className='text-12px'>{t('agent.skillEvolution.create.summaryLabel')}</Text>
          <TextArea
            className='mt-4px'
            value={summary}
            onChange={setSummary}
            placeholder={t('agent.skillEvolution.create.summaryPlaceholder')}
            autoSize={{ minRows: 4, maxRows: 10 }}
          />
        </div>
        <div>
          <Text className='text-12px'>{t('agent.skillEvolution.create.draftLabel')}</Text>
          <TextArea
            className='mt-4px font-mono text-12px'
            value={draftMd}
            onChange={setDraftMd}
            placeholder={t('agent.skillEvolution.create.draftPlaceholder')}
            autoSize={{ minRows: 6, maxRows: 16 }}
          />
        </div>
        <label className='flex items-center gap-8px text-13px'>
          <input type='checkbox' checked={submitNow} onChange={(e) => setSubmitNow(e.target.checked)} />
          {t('agent.skillEvolution.create.submitNow')}
        </label>
        <div className='flex gap-8px'>
          <Button type='outline' loading={busy} onClick={() => void handleCreate()}>
            {t('agent.skillEvolution.create.create')}
          </Button>
          <Button disabled={busy || evolving} onClick={() => navigate('/skill-evolution')}>
            {t('agent.skillEvolution.create.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SkillEvolutionCreatePage;
