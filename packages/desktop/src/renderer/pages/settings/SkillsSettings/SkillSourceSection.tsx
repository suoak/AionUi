/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// M8 E10: source, version history and "check for update" on the regular
// skill detail page. A refresh that changes scripts sends the skill back to
// the review queue (Core decides); we never apply anything automatically.
// E10-4: older versions can be compared and restored (restore = new version).

import { ipcBridge } from '@/common';
import type { SkillSourceDetail } from '@/common/types/skills/skillSources';
import { Button, Message } from '@arco-design/web-react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR, { mutate } from 'swr';
import { PENDING_SKILL_REVIEWS_KEY, SkillReviewDetail } from './SkillReviewQueue';
import { isRefreshableSource, skillReviewErrorKey } from './skillReviewModel';
import { RestoreVersionButton, SkillVersionCompare } from './SkillVersionTools';

const isNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 404;

const SkillSourceSection: React.FC<{ skillId: string }> = ({ skillId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sourceKey = `skills.source.${skillId}`;
  const { data, error } = useSWR<SkillSourceDetail>(sourceKey, () =>
    ipcBridge.fs.getSkillSourceDetail.invoke({ skill_id: skillId })
  );
  const [checking, setChecking] = useState(false);

  const checkUpdate = useCallback(async () => {
    setChecking(true);
    try {
      const result = await ipcBridge.fs.refreshSkillFromSource.invoke({ skill_id: skillId });
      void mutate(sourceKey);
      if (result.changed && result.skill.review_status === 'pending') {
        void mutate(PENDING_SKILL_REVIEWS_KEY);
        Message.warning(t('settings.skillsHub.sourceSection.movedToReview'));
        void navigate('/settings/skills', { state: { skillsTab: 'review' } });
        return;
      }
      if (result.changed) void mutate('skills.list');
      Message.info(
        t(result.changed ? 'settings.skillsHub.sourceSection.updated' : 'settings.skillsHub.review.refreshNoChange')
      );
    } catch (err) {
      Message.error(t(skillReviewErrorKey(err)));
    } finally {
      setChecking(false);
    }
  }, [navigate, skillId, sourceKey, t]);

  // Older Core without the source API: show nothing rather than an error card.
  if (isNotFound(error)) return null;
  if (!data && !error) return null;

  return (
    <section data-testid='skill-detail-source' className='rounded-16px border border-border-2 bg-base px-20px py-18px'>
      <div className='mb-14px flex items-center justify-between gap-12px'>
        <h2 className='m-0 text-14px font-600 text-t-primary'>{t('settings.skillsHub.sourceSection.title')}</h2>
        {data && isRefreshableSource(data.source) && (
          <Button
            size='mini'
            loading={checking}
            onClick={() => void checkUpdate()}
            data-testid='skill-detail-source-check-update'
          >
            {t('settings.skillsHub.sourceSection.checkUpdate')}
          </Button>
        )}
      </div>
      <SkillReviewDetail
        skillId={skillId}
        renderVersionActions={(version, isLatest) =>
          isLatest ? null : <RestoreVersionButton skillId={skillId} version={version} />
        }
      />
      {data && data.versions.length >= 2 && (
        <div className='mt-12px'>
          <SkillVersionCompare skillId={skillId} versions={data.versions} />
        </div>
      )}
    </section>
  );
};

export default SkillSourceSection;
