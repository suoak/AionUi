/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// M8 E10: skills waiting for a human decision. A script-bearing skill (new,
// or refreshed with changed scripts) stays unusable until approved here.
// There is deliberately no auto-apply / bulk-approve entry.

import { ipcBridge } from '@/common';
import type { SkillGovernance, SkillReviewDecision } from '@/common/types/skills/skillSources';
import { Alert, Button, Empty, Message, Modal, Spin, Tag } from '@arco-design/web-react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import SkillSourceImportModal from './SkillSourceImportModal';
import { isUntrustedSource, latestHasScripts, skillReviewErrorKey, versionCreatedByKey } from './skillReviewModel';

export const PENDING_SKILL_REVIEWS_KEY = 'skills.reviews.pending';

const formatTime = (ms: number | null | undefined): string => (ms ? new Date(ms).toLocaleString() : '—');

const SkillReviewDetail: React.FC<{ skillId: string }> = ({ skillId }) => {
  const { t } = useTranslation();
  const { data, error, isLoading } = useSWR(`skills.source.${skillId}`, () =>
    ipcBridge.fs.getSkillSourceDetail.invoke({ skill_id: skillId })
  );
  if (isLoading) return <Spin size={16} />;
  if (error || !data) return <div className='text-12px text-t-secondary'>{t(skillReviewErrorKey(error))}</div>;
  const { source, versions } = data;
  return (
    <div className='flex flex-col gap-8px text-12px' data-testid={`skill-review-detail-${skillId}`}>
      {isUntrustedSource(source) && (
        <Alert type='error' content={t('settings.skillsHub.review.untrusted')} data-testid='skill-review-untrusted' />
      )}
      <div>
        <span className='text-t-secondary'>{t('settings.skillsHub.review.source')}：</span>
        {source ? (
          <span className='break-all'>
            {source.kind} · {source.locator}
            {source.ref ? ` @ ${source.ref}` : ''}
            {source.subpath ? ` / ${source.subpath}` : ''}
          </span>
        ) : (
          t('settings.skillsHub.review.sourceNone')
        )}
      </div>
      {source && (
        <div className='text-t-secondary'>
          {t('settings.skillsHub.review.lastFetched')}：{formatTime(source.last_fetched_at)}
          {source.last_commit ? ` · ${source.last_commit.slice(0, 12)}` : ''}
        </div>
      )}
      <div className='text-t-secondary'>{t('settings.skillsHub.review.versions')}</div>
      <ul className='m-0 pl-16px'>
        {versions.map((v) => (
          <li key={v.version_no} data-testid={`skill-review-version-${v.version_no}`}>
            v{v.version_no} · {formatTime(v.created_at)} ·{' '}
            {versionCreatedByKey(v.created_by) ? t(versionCreatedByKey(v.created_by)!) : v.created_by}
            {v.has_scripts && (
              <Tag size='small' color='orangered' className='ml-6px'>
                {t('settings.skillsHub.review.scriptsBadge')}
              </Tag>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

const SkillReviewQueue: React.FC = () => {
  const { t } = useTranslation();
  const { data, isLoading, mutate } = useSWR<SkillGovernance[]>(PENDING_SKILL_REVIEWS_KEY, () =>
    ipcBridge.fs.listPendingSkillReviews.invoke()
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const decide = useCallback(
    async (skill: SkillGovernance, decision: SkillReviewDecision) => {
      setBusy(skill.skill_id);
      try {
        await ipcBridge.fs.reviewSkill.invoke({ skill_id: skill.skill_id, decision });
        Message.success(t(`settings.skillsHub.review.${decision === 'approve' ? 'approved' : 'rejected'}`));
      } catch (error) {
        Message.error(t(skillReviewErrorKey(error)));
      } finally {
        setBusy(null);
        void mutate();
      }
    },
    [mutate, t]
  );

  const confirmApprove = useCallback(
    async (skill: SkillGovernance) => {
      // Fetch the detail so the confirmation can name what is being enabled.
      let hasScripts = true;
      let untrusted = true;
      try {
        const detail = await ipcBridge.fs.getSkillSourceDetail.invoke({ skill_id: skill.skill_id });
        hasScripts = latestHasScripts(detail);
        untrusted = isUntrustedSource(detail.source);
      } catch {
        // Unknown detail: keep the strongest warning.
      }
      Modal.confirm({
        title: t('settings.skillsHub.review.approveConfirmTitle', { name: skill.name }),
        content: (
          <div className='flex flex-col gap-6px'>
            {hasScripts && <div>{t('settings.skillsHub.review.approveConfirmScripts')}</div>}
            {untrusted && <div className='text-danger'>{t('settings.skillsHub.review.untrusted')}</div>}
          </div>
        ),
        okText: t('settings.skillsHub.review.approve'),
        okButtonProps: { status: 'danger' },
        onOk: () => decide(skill, 'approve'),
      });
    },
    [decide, t]
  );

  const refresh = useCallback(
    async (skill: SkillGovernance) => {
      setBusy(skill.skill_id);
      try {
        const result = await ipcBridge.fs.refreshSkillFromSource.invoke({ skill_id: skill.skill_id });
        Message.info(
          t(result.changed ? 'settings.skillsHub.review.refreshChanged' : 'settings.skillsHub.review.refreshNoChange')
        );
      } catch (error) {
        Message.error(t(skillReviewErrorKey(error)));
      } finally {
        setBusy(null);
        void mutate();
      }
    },
    [mutate, t]
  );

  if (isLoading) return <Spin className='m-24px' />;
  const items = data ?? [];
  return (
    <div className='flex flex-col gap-12px' data-testid='skill-review-queue'>
      <Alert type='warning' content={t('settings.skillsHub.review.intro')} />
      <div>
        <Button size='small' onClick={() => setImportOpen(true)} data-testid='skill-source-import-open'>
          {t('settings.skillsHub.review.import.open')}
        </Button>
      </div>
      <SkillSourceImportModal
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void mutate()}
      />
      {items.length === 0 ? (
        <Empty description={t('settings.skillsHub.review.empty')} />
      ) : (
        items.map((skill) => (
          <div
            key={skill.skill_id}
            className='rd-8px border border-solid border-border-2 p-12px flex flex-col gap-8px'
            data-testid={`skill-review-item-${skill.skill_id}`}
          >
            <div className='flex items-center gap-8px'>
              <span className='font-500 flex-1 min-w-0 truncate'>{skill.name}</span>
              <Tag size='small' color='orange'>
                {t('settings.skillsHub.review.pendingTag')}
              </Tag>
              <Button
                size='mini'
                onClick={() => setExpanded((cur) => (cur === skill.skill_id ? null : skill.skill_id))}
                data-testid={`skill-review-toggle-${skill.skill_id}`}
              >
                {t('settings.skillsHub.review.details')}
              </Button>
              <Button
                size='mini'
                loading={busy === skill.skill_id}
                onClick={() => void refresh(skill)}
                data-testid={`skill-review-refresh-${skill.skill_id}`}
              >
                {t('settings.skillsHub.review.refresh')}
              </Button>
              <Button
                size='mini'
                disabled={busy === skill.skill_id}
                onClick={() => void decide(skill, 'reject')}
                data-testid={`skill-review-reject-${skill.skill_id}`}
              >
                {t('settings.skillsHub.review.reject')}
              </Button>
              <Button
                size='mini'
                type='primary'
                disabled={busy === skill.skill_id}
                onClick={() => void confirmApprove(skill)}
                data-testid={`skill-review-approve-${skill.skill_id}`}
              >
                {t('settings.skillsHub.review.approve')}
              </Button>
            </div>
            {expanded === skill.skill_id && <SkillReviewDetail skillId={skill.skill_id} />}
          </div>
        ))
      )}
    </div>
  );
};

export default SkillReviewQueue;
