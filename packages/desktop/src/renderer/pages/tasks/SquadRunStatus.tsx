/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tag } from '@arco-design/web-react';
import { formatRelativeTime } from '@/renderer/utils/chat/relativeTime';
import { primarySquadRun, SQUAD_RUN_COLOR } from './squadRunModel';
import { useSquadRuns } from './useSquadRuns';

/** Compact card badge: the most attention-worthy run of the Squad's teams. Renders nothing when unknown. */
export const SquadRunBadge: React.FC<{ templateId: string }> = ({ templateId }) => {
  const { t } = useTranslation();
  const { runs } = useSquadRuns(templateId);
  const primary = primarySquadRun(runs);
  if (!primary?.run) return null;
  const extra = runs.filter((entry) => entry.run).length - 1;
  return (
    <Tag
      size='small'
      color={SQUAD_RUN_COLOR[primary.run.state]}
      data-testid='task-board-card-squad-run'
      data-state={primary.run.state}
    >
      {t(`conversation.taskBoard.squadRun.state.${primary.run.state}`)}
      {extra > 0 ? ` +${extra}` : ''}
    </Tag>
  );
};

type SquadRunPanelProps = {
  templateId: string;
  onOpenConversation: (conversationId: string) => void;
};

/** Drawer section: one row per team instantiated from the Squad. */
export const SquadRunPanel: React.FC<SquadRunPanelProps> = ({ templateId, onOpenConversation }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language ?? 'en-US';
  const { teams, runs, loading } = useSquadRuns(templateId);

  let body: React.ReactNode;
  if (teams.length === 0) {
    body = loading ? null : (
      <div className='text-13px text-t-secondary' data-testid='task-board-squad-run-no-team'>
        {t('conversation.taskBoard.squadRun.noTeam')}
      </div>
    );
  } else if (runs.length === 0) {
    body = loading ? null : (
      <div className='text-13px text-t-secondary' data-testid='task-board-squad-run-unavailable'>
        {t('conversation.taskBoard.squadRun.unavailable')}
      </div>
    );
  } else {
    body = (
      <ul className='m-0 p-0 list-none flex flex-col gap-8px'>
        {runs.map(({ team, run }) => (
          <li
            key={team.id}
            className='flex flex-wrap items-center gap-6px text-13px'
            data-testid={`task-board-squad-run-${team.id}`}
          >
            <span className='text-t-primary font-medium break-all'>{team.name || team.id}</span>
            {run ? (
              <>
                <Tag size='small' color={SQUAD_RUN_COLOR[run.state]} data-state={run.state}>
                  {t(`conversation.taskBoard.squadRun.state.${run.state}`)}
                </Tag>
                {run.leader_mode === 'route_only' ? (
                  <Tag size='small'>{t('conversation.taskBoard.squadRun.routeOnly')}</Tag>
                ) : null}
                {run.updated_at > 0 ? (
                  <span className='text-12px text-t-tertiary'>{formatRelativeTime(run.updated_at, locale)}</span>
                ) : null}
                {run.leader_conversation_id ? (
                  <Button
                    size='mini'
                    type='text'
                    data-testid={`task-board-squad-run-open-${team.id}`}
                    onClick={() => onOpenConversation(run.leader_conversation_id as string)}
                  >
                    {t('conversation.taskBoard.squadRun.openLeader')}
                  </Button>
                ) : null}
              </>
            ) : (
              <Tag size='small' data-state='idle'>
                {t('conversation.taskBoard.squadRun.idle')}
              </Tag>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section data-testid='task-board-squad-run'>
      <div className='text-13px font-medium text-t-primary mb-6px'>{t('conversation.taskBoard.squadRun.title')}</div>
      {body}
      <div className='text-12px text-t-tertiary mt-6px'>{t('conversation.taskBoard.squadRun.hint')}</div>
    </section>
  );
};
