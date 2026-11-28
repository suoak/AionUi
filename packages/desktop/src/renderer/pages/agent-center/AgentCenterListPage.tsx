/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Dropdown, Menu, Message, Modal, Tabs, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { AgentCenterListItem } from '@/common/types/agent/agentCenterTypes';
import { assistantRuntimeKey } from '@/common/types/agent/assistantTypes';
import type { IGovernanceMe } from '@/common/types/governance';
import AssistantAvatar from '@/renderer/pages/settings/AssistantSettings/AssistantAvatar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatAgentCenterError } from './agentCenterErrors';
import { isEmptyDueToPermissions } from './agentCenterEmpty';
import PreflightBadge from './PreflightBadge';
import { useAgentPreflight } from './useAgentPreflight';

const { Title, Text } = Typography;
const TabPane = Tabs.TabPane;

type Scope = 'mine' | 'team';

const KNOWN_STATUS = new Set(['draft', 'published', 'archived']);

const AgentCenterListPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [scope, setScope] = useState<Scope>('mine');
  const [items, setItems] = useState<AgentCenterListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [me, setMe] = useState<IGovernanceMe | null>(null);
  const [message, messageContext] = Message.useMessage({ maxCount: 5 });
  // Arco useMessage() returns a new API object each render — keep a ref so
  // load() deps stay stable and we do not re-fetch in a loop.
  const messageRef = useRef(message);
  messageRef.current = message;
  const tRef = useRef(t);
  tRef.current = t;
  const { byAgentId: preflightByAgent } = useAgentPreflight();
  // 3.0 U4: team sharing shows only where roles are on.
  const teamSharing = Boolean(me?.roles_active);
  const activeScope: Scope = teamSharing ? scope : 'mine';

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await ipcBridge.agentCenter.list.invoke({ scope: activeScope });
      setItems(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error(error);
      const msg = formatAgentCenterError(error, tRef.current('agent.agentCenter.list.loadFailed'));
      setLoadError(msg);
      setItems([]);
      messageRef.current.error(msg);
    } finally {
      setLoading(false);
    }
  }, [activeScope]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void ipcBridge.governance.me
      .invoke()
      .then((result) => {
        if (!cancelled) setMe(result ?? null);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Member with roles active + empty list → catalog filtered by agent_run_permissions. */
  const emptyDueToPermissions = useMemo(
    () => isEmptyDueToPermissions(me, { loading, loadError, itemCount: items.length }),
    [me, loading, loadError, items.length]
  );

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
      messageRef.current.error(formatAgentCenterError(error, t('agent.agentCenter.list.tryRunFailed')));
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
      messageRef.current.success(t('agent.agentCenter.list.publishedToast', { version: published.meta.version }));
      await load();
    } catch (error) {
      console.error(error);
      messageRef.current.error(formatAgentCenterError(error, t('agent.agentCenter.list.publishFailed')));
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

  const statusText = (status: string) =>
    KNOWN_STATUS.has(status) ? t(`agent.agentCenter.list.status.${status}`) : status;

  return (
    <div className='h-full overflow-auto p-24px' data-testid='agent-center-list'>
      {messageContext}
      <div className='flex items-center justify-between mb-16px gap-12px flex-wrap'>
        <div>
          <Title heading={4} className='!mb-4px'>
            {t('agent.agentCenter.title')}
          </Title>
          <Text type='secondary'>{t('agent.agentCenter.description')}</Text>
        </div>
        <div className='flex gap-8px'>
          {/* 3.0 U8: Squads are an advanced tool now. */}
          <Dropdown
            trigger='click'
            position='br'
            droplist={
              <Menu onClickMenuItem={(key) => key === 'squads' && navigate('/agents/squads')}>
                <Menu.Item key='squads' data-testid='agent-center-squads'>
                  {t('agent.agentCenter.squad.entry')}
                </Menu.Item>
              </Menu>
            }
          >
            <Button data-testid='agent-center-advanced'>{t('agent.agentCenter.list.advanced')}</Button>
          </Dropdown>
          <Button type='primary' onClick={() => navigate('/agents/new')} data-testid='agent-center-create'>
            {t('agent.agentCenter.list.create')}
          </Button>
        </div>
      </div>

      {teamSharing ? (
        <Tabs activeTab={activeScope} onChange={(key) => setScope(key as Scope)}>
          <TabPane key='mine' title={t('agent.agentCenter.list.tabs.mine')} />
          <TabPane key='team' title={t('agent.agentCenter.list.tabs.team')} />
        </Tabs>
      ) : null}

      <div className='mt-16px flex flex-col gap-12px'>
        {loading && <Text type='secondary'>{t('agent.agentCenter.list.loading')}</Text>}
        {!loading && loadError && (
          <div className='rounded-8px border border-[var(--color-danger-light-3)] bg-[var(--color-danger-light-1)] p-12px flex items-center justify-between gap-12px'>
            <Text type='error'>{loadError}</Text>
            <Button size='small' onClick={() => void load()}>
              {t('agent.agentCenter.list.retry')}
            </Button>
          </div>
        )}
        {!loading && !loadError && items.length === 0 && (
          <div data-testid='agent-center-empty' className='flex flex-col gap-8px'>
            {emptyDueToPermissions ? (
              <>
                <Text type='secondary' data-testid='agent-center-empty-permission-hint'>
                  {t('agent.agentCenter.empty.permissionHint')}
                </Text>
                <Text type='secondary' className='text-12px'>
                  {t('agent.agentCenter.empty.permissionHintDetail')}
                </Text>
              </>
            ) : (
              <Text type='secondary' data-testid='agent-center-empty-create-hint'>
                {t('agent.agentCenter.empty.createHint')}
              </Text>
            )}
          </div>
        )}
      </div>

      {items.length > 0 ? (
        <div className='grid gap-12px grid-cols-[repeat(auto-fill,minmax(280px,1fr))]' data-testid='agent-center-grid'>
          {items.map((item) => {
            const id = item.assistant.id;
            const isDraft = item.meta.status === 'draft';
            const busy = busyId === id;
            const runtime = assistantRuntimeKey(item.assistant);
            const preflight = item.assistant.agent_id ? preflightByAgent.get(item.assistant.agent_id) : undefined;
            const meta = [
              t(`agent.agentCenter.list.visibility.${item.meta.visibility}`),
              statusText(item.meta.status),
              item.meta.version > 0 ? `v${item.meta.version}` : t('agent.agentCenter.list.unpublished'),
            ];
            if (item.meta.skill_refs?.length) {
              meta.push(t('agent.agentCenter.list.skills', { count: item.meta.skill_refs.length }));
            }
            return (
              <div
                key={id}
                data-testid='agent-center-card'
                className='rounded-12px border border-solid border-[var(--color-border-2)] bg-1 p-16px flex flex-col gap-10px min-w-0'
              >
                <div
                  className='flex items-start gap-10px min-w-0 cursor-pointer'
                  onClick={() => navigate(`/agents/${id}`)}
                  role='button'
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(`/agents/${id}`);
                  }}
                >
                  <AssistantAvatar assistant={item.assistant} size={36} />
                  <div className='min-w-0 flex-1'>
                    <div className='font-medium truncate'>{item.assistant.name}</div>
                    <div className='flex items-center gap-6px flex-wrap mt-2px'>
                      {runtime ? (
                        <Text type='secondary' className='text-12px' data-testid='agent-center-runtime'>
                          {runtime}
                        </Text>
                      ) : null}
                      <PreflightBadge preflight={preflight} />
                    </div>
                  </div>
                </div>
                {item.assistant.description ? (
                  <div className='text-13px text-[var(--color-text-2)] line-clamp-2'>{item.assistant.description}</div>
                ) : null}
                <Text type='secondary' className='text-12px'>
                  {meta.join(' · ')}
                  {item.assistant.last_used_at
                    ? ` · ${t('agent.agentCenter.list.lastUsed', {
                        time: new Date(item.assistant.last_used_at).toLocaleDateString(),
                      })}`
                    : ''}
                </Text>
                <div className='flex gap-8px flex-wrap mt-auto'>
                  <Button size='small' type='primary' loading={busy} onClick={() => void handleTryRun(id)}>
                    {t('agent.agentCenter.list.tryRun')}
                  </Button>
                  <Button size='small' disabled={busy} onClick={() => navigate(`/agents/${id}/edit`)}>
                    {t('agent.agentCenter.list.edit')}
                  </Button>
                  {isDraft ? (
                    <Button size='small' loading={busy} onClick={() => void handlePublish(id)}>
                      {t('agent.agentCenter.list.publish')}
                    </Button>
                  ) : (
                    activeScope === 'mine' &&
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
      ) : null}
    </div>
  );
};

export default AgentCenterListPage;
