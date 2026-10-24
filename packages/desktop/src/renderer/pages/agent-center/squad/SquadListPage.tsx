/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { Button, Message, Modal, Tag, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { SquadTemplate } from '@/common/types/agent/squad';
import SquadEditorDrawer from './SquadEditorDrawer';
import SquadPreviewDrawer from './SquadPreviewDrawer';
import { missingSquadRefs, squadErrorKey, squadErrorReason, squadInUseTeamIds } from './squadModel';

const { Title, Text } = Typography;

export const SQUADS_SWR_KEY = 'squads.list';

/** Agent Center → Squad templates (M8 E7-6). */
const SquadListPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: squads, error, isLoading, mutate } = useSWR(SQUADS_SWR_KEY, () => ipcBridge.squads.list.invoke({}));
  const { data: assistants } = useSWR('squads.assistants', () => ipcBridge.assistants.list.invoke());
  const [editing, setEditing] = useState<SquadTemplate | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewing, setPreviewing] = useState<SquadTemplate | null>(null);

  const openEditor = (squad: SquadTemplate | null) => {
    setEditing(squad);
    setEditorOpen(true);
  };

  const remove = (squad: SquadTemplate) => {
    Modal.confirm({
      title: t('agent.agentCenter.squad.deleteConfirmTitle'),
      content: t('agent.agentCenter.squad.deleteConfirmContent', { name: squad.name }),
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        try {
          await ipcBridge.squads.remove.invoke({ id: squad.id });
          Message.success(t('agent.agentCenter.squad.deleted'));
          await mutate();
        } catch (err) {
          console.error('[Squad] Delete failed:', err);
          Message.error(
            squadErrorReason(err) === 'squad_in_use'
              ? t('agent.agentCenter.squad.inUseCount', { count: squadInUseTeamIds(err).length })
              : t(squadErrorKey(err))
          );
        }
      },
    });
  };

  return (
    <div className='h-full overflow-auto p-24px' data-testid='squad-list-page'>
      <div className='flex items-center justify-between mb-16px gap-12px flex-wrap'>
        <div>
          <Button size='mini' type='text' onClick={() => navigate('/agent-center')}>
            ← {t('agent.agentCenter.squad.back')}
          </Button>
          <Title heading={4} className='!mb-4px'>
            {t('agent.agentCenter.squad.title')}
          </Title>
          <Text type='secondary'>{t('agent.agentCenter.squad.description')}</Text>
        </div>
        <Button type='primary' onClick={() => openEditor(null)} data-testid='squad-create'>
          {t('agent.agentCenter.squad.create')}
        </Button>
      </div>

      <div className='flex flex-col gap-12px'>
        {isLoading ? <Text type='secondary'>{t('agent.agentCenter.squad.loading')}</Text> : null}
        {error ? (
          <div className='flex items-center justify-between gap-12px rounded-8px border border-[var(--color-danger-light-3)] p-12px'>
            <Text type='error'>{t(squadErrorKey(error))}</Text>
            <Button size='small' onClick={() => void mutate()}>
              {t('agent.agentCenter.squad.retry')}
            </Button>
          </div>
        ) : null}
        {!isLoading && !error && squads?.length === 0 ? (
          <Text type='secondary' data-testid='squad-empty'>
            {t('agent.agentCenter.squad.empty')}
          </Text>
        ) : null}
        {squads?.map((squad) => {
          const missing = missingSquadRefs(squad).length;
          return (
            <div
              key={squad.id}
              className='rounded-8px border border-[var(--color-border-2)] p-16px flex items-center justify-between gap-12px'
              data-testid='squad-card'
            >
              <div className='min-w-0'>
                <div className='font-medium truncate'>{squad.name}</div>
                <Text type='secondary' className='text-12px'>
                  {t('agent.agentCenter.squad.leaderLabel', { name: squad.leader?.name ?? squad.leader_assistant_id })}
                  {' · '}
                  {t('agent.agentCenter.squad.memberCount', { count: squad.members.length })}
                  {' · '}
                  {t(`agent.agentCenter.squad.leaderMode.${squad.leader_mode}`)}
                </Text>
                {missing > 0 ? (
                  <div className='mt-4px'>
                    <Tag size='small' color='orange' data-testid='squad-missing'>
                      {t('agent.agentCenter.squad.missingRefs', { count: missing })}
                    </Tag>
                  </div>
                ) : null}
                {squad.description ? (
                  <div className='text-13px mt-4px text-[var(--color-text-2)] line-clamp-2'>{squad.description}</div>
                ) : null}
              </div>
              <div className='flex gap-8px shrink-0'>
                <Button
                  size='small'
                  type='primary'
                  onClick={() => setPreviewing(squad)}
                  data-testid='squad-preview-open'
                >
                  {t('agent.agentCenter.squad.previewAction')}
                </Button>
                <Button size='small' onClick={() => openEditor(squad)} data-testid='squad-edit'>
                  {t('agent.agentCenter.squad.edit')}
                </Button>
                <Button size='small' status='danger' onClick={() => remove(squad)} data-testid='squad-delete'>
                  {t('agent.agentCenter.squad.delete')}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <SquadEditorDrawer
        visible={editorOpen}
        squad={editing}
        assistants={assistants ?? []}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          setEditorOpen(false);
          void mutate();
        }}
        onStale={() => {
          setEditorOpen(false);
          void mutate();
        }}
      />
      {previewing ? <SquadPreviewDrawer visible squad={previewing} onClose={() => setPreviewing(null)} /> : null}
    </div>
  );
};

export default SquadListPage;
