/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// M8 E10-5: the installation team skill library. Shown only when Core reports
// multi-user roles (`enabled`). Owner/admin publish (from the skill detail page)
// and unpublish; members use team skills as-is or copy one into their own
// skills. Core enforces every rule; this view only hides refused actions.

import { ipcBridge } from '@/common';
import type { TeamSkill, TeamSkillLibrary as TeamSkillLibraryData } from '@/common/types/skills/skillSources';
import { Alert, Button, Empty, Message, Modal, Spin, Tag } from '@arco-design/web-react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR, { mutate as globalMutate } from 'swr';
import { PENDING_SKILL_REVIEWS_KEY } from './SkillReviewQueue';
import { skillReviewErrorKey, teamSkillActions } from './skillReviewModel';

export const TEAM_SKILLS_KEY = 'skills.team';

/** Team library state; older Core (404) or any error reads as "no team". */
export const useTeamSkillLibrary = () =>
  useSWR<TeamSkillLibraryData | null>(TEAM_SKILLS_KEY, async () => {
    try {
      return await ipcBridge.fs.getTeamSkillLibrary.invoke();
    } catch {
      return null;
    }
  });

const TeamSkillLibrary: React.FC<{ onCopied?: () => void }> = ({ onCopied }) => {
  const { t } = useTranslation();
  const { data, isLoading, mutate } = useTeamSkillLibrary();
  const [busy, setBusy] = useState<string | null>(null);

  const copy = useCallback(
    async (skill: TeamSkill) => {
      setBusy(skill.skill_id);
      try {
        const result = await ipcBridge.fs.copyTeamSkillToPrivate.invoke({ skill_id: skill.skill_id });
        if (result.skill.review_status === 'pending') {
          void globalMutate(PENDING_SKILL_REVIEWS_KEY);
          Message.warning(t('settings.skillsHub.team.copiedNeedsReview', { name: skill.name }));
        } else {
          Message.success(t('settings.skillsHub.team.copied', { name: skill.name }));
        }
        onCopied?.();
      } catch (error) {
        Message.error(t(skillReviewErrorKey(error)));
      } finally {
        setBusy(null);
      }
    },
    [onCopied, t]
  );

  const unpublish = useCallback(
    (skill: TeamSkill) => {
      Modal.confirm({
        title: t('settings.skillsHub.team.unpublishConfirmTitle', { name: skill.name }),
        content: t('settings.skillsHub.team.unpublishConfirmContent'),
        okText: t('settings.skillsHub.team.unpublish'),
        okButtonProps: { status: 'danger' },
        onOk: async () => {
          setBusy(skill.skill_id);
          try {
            await ipcBridge.fs.setSkillVisibility.invoke({ skill_id: skill.skill_id, visibility: 'private' });
            void globalMutate(`skills.source.${skill.skill_id}`);
            Message.success(t('settings.skillsHub.team.unpublished', { name: skill.name }));
          } catch (error) {
            Message.error(t(skillReviewErrorKey(error)));
          } finally {
            setBusy(null);
            void mutate();
          }
        },
      });
    },
    [mutate, t]
  );

  if (isLoading) return <Spin className='m-24px' />;
  if (!data?.enabled) return null;
  return (
    <div className='flex flex-col gap-12px' data-testid='team-skill-library'>
      <Alert
        type='info'
        content={t(data.can_manage ? 'settings.skillsHub.team.introManage' : 'settings.skillsHub.team.introMember')}
      />
      {data.skills.length === 0 ? (
        <Empty description={t('settings.skillsHub.team.empty')} />
      ) : (
        data.skills.map((skill) => {
          const actions = teamSkillActions(skill, data.can_manage);
          const held = skill.review_status === 'pending' || skill.review_status === 'rejected';
          return (
            <div
              key={skill.skill_id}
              className='rd-8px border border-solid border-border-2 p-12px flex flex-col gap-6px'
              data-testid={`team-skill-item-${skill.skill_id}`}
            >
              <div className='flex items-center gap-8px'>
                <span className='font-500 flex-1 min-w-0 truncate'>{skill.name}</span>
                {skill.mine && (
                  <Tag size='small' color='arcoblue'>
                    {t('settings.skillsHub.team.mineTag')}
                  </Tag>
                )}
                {held && (
                  <Tag size='small' color='orange' data-testid={`team-skill-held-${skill.skill_id}`}>
                    {t('settings.skillsHub.team.heldTag')}
                  </Tag>
                )}
                {actions.canCopy && (
                  <Button
                    size='mini'
                    loading={busy === skill.skill_id}
                    onClick={() => void copy(skill)}
                    data-testid={`team-skill-copy-${skill.skill_id}`}
                  >
                    {t('settings.skillsHub.team.copy')}
                  </Button>
                )}
                {actions.canUnpublish && (
                  <Button
                    size='mini'
                    disabled={busy === skill.skill_id}
                    onClick={() => unpublish(skill)}
                    data-testid={`team-skill-unpublish-${skill.skill_id}`}
                  >
                    {t('settings.skillsHub.team.unpublish')}
                  </Button>
                )}
              </div>
              {skill.description && (
                <p className='m-0 text-12px text-t-secondary line-clamp-2' title={skill.description}>
                  {skill.description}
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

export default TeamSkillLibrary;
