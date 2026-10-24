/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import { Alert, Button, Drawer, Input, Message, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { SquadTemplate } from '@/common/types/agent/squad';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import {
  squadErrorKey,
  squadIneligibleAssistantId,
  squadPreviewBlockers,
  squadUnenforceableLeader,
} from './squadModel';

const { Text } = Typography;

type Props = {
  visible: boolean;
  squad: SquadTemplate | null;
  onClose: () => void;
};

/** Squad member-config preview + "create team from Squad" (M8 E7-2). */
const SquadPreviewDrawer: React.FC<Props> = ({ visible, squad, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mutate: globalMutate } = useSWRConfig();
  const { user } = useAuth();
  const [teamName, setTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const squadId = visible ? squad?.id : undefined;
  const {
    data: preview,
    error,
    isLoading,
    mutate,
  } = useSWR(squadId ? `squads.preview/${squadId}` : null, () => ipcBridge.squads.preview.invoke({ id: squadId! }), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  useEffect(() => {
    if (visible) setTeamName(squad?.name ?? '');
  }, [visible, squad?.id, squad?.name]);

  const instantiate = async () => {
    if (!squad || !preview?.can_instantiate) return;
    setCreating(true);
    try {
      const name = teamName.trim();
      const { team } = await ipcBridge.squads.instantiate.invoke({
        id: squad.id,
        input: name && name !== squad.name ? { name } : {},
      });
      Message.success(t('agent.agentCenter.squad.preview.created', { name: team.name }));
      void globalMutate(`teams/${user?.id ?? 'system_default_user'}`);
      onClose();
      Promise.resolve(navigate(`/team/${team.id}`)).catch(console.error);
    } catch (err) {
      console.error('[Squad] Instantiate failed:', err);
      const ineligible = squadIneligibleAssistantId(err);
      const unenforceable = squadUnenforceableLeader(err);
      if (unenforceable) {
        const p = preview.participants.find((x) => x.assistant_id === unenforceable.assistantId);
        Message.error(
          t('agent.agentCenter.squad.preview.leaderUnenforceableNamed', {
            name: p?.assistant.name || unenforceable.assistantId || '',
            backend: unenforceable.backend || p?.backend || '',
          })
        );
      } else if (ineligible) {
        const p = preview.participants.find((x) => x.assistant_id === ineligible);
        Message.error(t('agent.agentCenter.squad.ineligibleNamed', { name: p?.assistant.name || ineligible }));
      } else {
        Message.error(t(squadErrorKey(err)));
      }
      void mutate();
    } finally {
      setCreating(false);
    }
  };

  const blockers = preview ? squadPreviewBlockers(preview) : [];

  return (
    <Drawer
      width={560}
      visible={visible}
      title={t('agent.agentCenter.squad.preview.title', { name: squad?.name ?? '' })}
      onCancel={onClose}
      unmountOnExit
      footer={
        <div className='flex justify-end gap-8px'>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type='primary'
            loading={creating}
            disabled={!preview?.can_instantiate}
            onClick={() => void instantiate()}
            data-testid='squad-instantiate'
          >
            {t('agent.agentCenter.squad.preview.instantiate')}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-12px' data-testid='squad-preview'>
        {isLoading ? <Text type='secondary'>{t('agent.agentCenter.squad.loading')}</Text> : null}
        {error ? (
          <div className='flex items-center justify-between gap-12px'>
            <Text type='error'>{t(squadErrorKey(error))}</Text>
            <Button size='small' onClick={() => void mutate()}>
              {t('agent.agentCenter.squad.retry')}
            </Button>
          </div>
        ) : null}
        {preview ? (
          <>
            <Text type='secondary'>
              {t(`agent.agentCenter.squad.leaderMode.${preview.leader_mode}`)}
              {' — '}
              {t(`agent.agentCenter.squad.leaderModeHint.${preview.leader_mode}`)}
            </Text>
            <Alert type='info' content={t('agent.agentCenter.squad.preview.fixedRoster')} />
            {blockers.length > 0 ? (
              <Alert
                type='warning'
                data-testid='squad-preview-blockers'
                content={
                  <ul className='m-0 pl-16px'>
                    {blockers.map((b, i) => (
                      <li key={i}>{t(b.key, { name: b.assistantName ?? '' })}</li>
                    ))}
                  </ul>
                }
              />
            ) : null}
            {preview.participants.map((p) => (
              <div
                key={`${p.role}-${p.assistant_id}-${p.agent_name}`}
                className='rounded-8px border border-[var(--color-border-2)] p-12px'
                data-testid='squad-preview-participant'
              >
                <div className='flex items-center gap-8px flex-wrap'>
                  <Tag size='small' color={p.role === 'lead' ? 'arcoblue' : 'gray'}>
                    {t(`agent.agentCenter.squad.preview.role.${p.role === 'lead' ? 'lead' : 'teammate'}`)}
                  </Tag>
                  <span className='font-medium'>{p.agent_name}</span>
                  <Text type='secondary' className='text-12px'>
                    {p.assistant.name || p.assistant_id}
                    {p.backend ? ` · ${p.backend}` : ''}
                  </Text>
                  {!p.eligible ? (
                    <Tag size='small' color='orange' data-testid='squad-preview-ineligible'>
                      {t('agent.agentCenter.squad.preview.ineligible')}
                    </Tag>
                  ) : null}
                  {p.native_tool_enforcement === 'unenforceable' ? (
                    <Tooltip
                      content={t(
                        `agent.agentCenter.squad.preview.unenforceableHint.${
                          p.tool_profile === 'route_only_leader' ? 'leader' : 'member'
                        }`,
                        { backend: p.backend ?? '' }
                      )}
                    >
                      <Tag
                        size='small'
                        color={p.tool_profile === 'route_only_leader' ? 'red' : 'gold'}
                        data-testid='squad-preview-unenforceable'
                      >
                        {t('agent.agentCenter.squad.preview.unenforceable')}
                      </Tag>
                    </Tooltip>
                  ) : null}
                </div>
                {p.role_description ? (
                  <div className='text-13px mt-4px text-[var(--color-text-2)] line-clamp-3'>{p.role_description}</div>
                ) : null}
                <Text type='secondary' className='text-12px'>
                  {t('agent.agentCenter.squad.preview.maxParallel', { count: p.max_parallel })}
                </Text>
                {p.team_tools ? (
                  <div className='text-12px mt-4px' data-testid='squad-preview-tools'>
                    <Text type='secondary'>{t('agent.agentCenter.squad.preview.teamTools')}</Text>{' '}
                    {p.team_tools.length > 0 ? p.team_tools.join(', ') : t('agent.agentCenter.squad.preview.noTools')}
                  </div>
                ) : null}
              </div>
            ))}
            <div>
              <div className='text-13px mb-4px'>{t('agent.agentCenter.squad.preview.teamName')}</div>
              <Input
                value={teamName}
                maxLength={100}
                onChange={setTeamName}
                placeholder={squad?.name}
                data-testid='squad-preview-team-name'
              />
            </div>
          </>
        ) : null}
      </div>
    </Drawer>
  );
};

export default SquadPreviewDrawer;
