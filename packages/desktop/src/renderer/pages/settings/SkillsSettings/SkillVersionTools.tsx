/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// M8 E10-4: compare two stored versions of a skill and restore an older one.
// Core (E10-3) records a restore as a new version, so history is never lost,
// and script-bearing content goes back to the review queue (D10-7).

import { ipcBridge } from '@/common';
import type { SkillVersion, SkillVersionDiff } from '@/common/types/skills/skillSources';
import { Button, Empty, Message, Modal, Select, Tag } from '@arco-design/web-react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mutate } from 'swr';
import { PENDING_SKILL_REVIEWS_KEY } from './SkillReviewQueue';
import { defaultComparePair, skillReviewErrorKey } from './skillReviewModel';

const STATUS_COLOR: Record<string, string> = { added: 'green', removed: 'red', modified: 'arcoblue' };

export const SkillVersionCompare: React.FC<{ skillId: string; versions: SkillVersion[] }> = ({ skillId, versions }) => {
  const { t } = useTranslation();
  const initial = defaultComparePair(versions.map((v) => v.version_no));
  const [from, setFrom] = useState<number | undefined>(initial?.from);
  const [to, setTo] = useState<number | undefined>(initial?.to);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SkillVersionDiff | null>(null);

  const compare = useCallback(async () => {
    if (from === undefined || to === undefined) return;
    if (from === to) {
      Message.info(t('settings.skillsHub.sourceSection.compareSame'));
      return;
    }
    setLoading(true);
    try {
      setResult(await ipcBridge.fs.diffSkillVersions.invoke({ skill_id: skillId, from, to }));
    } catch (err) {
      setResult(null);
      Message.error(t(skillReviewErrorKey(err)));
    } finally {
      setLoading(false);
    }
  }, [from, skillId, t, to]);

  if (!initial) return null;
  const options = versions.map((v) => (
    <Select.Option key={v.version_no} value={v.version_no}>
      v{v.version_no}
    </Select.Option>
  ));
  return (
    <div className='flex flex-col gap-8px text-12px' data-testid='skill-version-compare'>
      <div className='flex flex-wrap items-center gap-8px'>
        <span className='text-t-secondary'>{t('settings.skillsHub.sourceSection.compare')}</span>
        <Select
          size='mini'
          style={{ width: 88 }}
          value={from}
          onChange={(v: number) => setFrom(v)}
          aria-label={t('settings.skillsHub.sourceSection.compareFrom')}
        >
          {options}
        </Select>
        <span className='text-t-secondary'>→</span>
        <Select
          size='mini'
          style={{ width: 88 }}
          value={to}
          onChange={(v: number) => setTo(v)}
          aria-label={t('settings.skillsHub.sourceSection.compareTo')}
        >
          {options}
        </Select>
        <Button size='mini' loading={loading} onClick={() => void compare()} data-testid='skill-version-compare-run'>
          {t('settings.skillsHub.sourceSection.compareRun')}
        </Button>
      </div>
      {result &&
        (result.files.length === 0 ? (
          <Empty description={t('settings.skillsHub.sourceSection.noDifferences')} />
        ) : (
          <div className='flex flex-col gap-8px' data-testid='skill-version-diff'>
            {result.files.map((f) => (
              <div
                key={f.path}
                className='rd-8px border border-solid border-border-2'
                data-testid={`skill-version-diff-file-${f.path}`}
              >
                <div className='flex items-center gap-6px px-10px py-6px'>
                  <span className='font-mono break-all flex-1 min-w-0'>{f.path}</span>
                  {f.script && (
                    <Tag size='small' color='orangered'>
                      {t('settings.skillsHub.review.scriptsBadge')}
                    </Tag>
                  )}
                  <Tag size='small' color={STATUS_COLOR[f.status] ?? 'gray'}>
                    {t(`settings.skillsHub.sourceSection.file.${f.status}`, { defaultValue: f.status })}
                  </Tag>
                </div>
                {f.diff ? (
                  <pre className='m-0 max-h-320px overflow-auto border-t border-t-solid border-border-2 px-10px py-6px text-11px leading-16px whitespace-pre'>
                    {f.diff.split('\n').map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.startsWith('+') && !line.startsWith('+++')
                            ? 'text-success'
                            : line.startsWith('-') && !line.startsWith('---')
                              ? 'text-danger'
                              : undefined
                        }
                      >
                        {line || ' '}
                      </div>
                    ))}
                  </pre>
                ) : (
                  <div className='px-10px pb-6px text-t-secondary'>
                    {t(
                      f.binary
                        ? 'settings.skillsHub.sourceSection.binaryFile'
                        : 'settings.skillsHub.sourceSection.tooLarge'
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
};

/** "Restore" on an older version row; asks first and names the consequences. */
export const RestoreVersionButton: React.FC<{ skillId: string; version: SkillVersion }> = ({ skillId, version }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const restore = useCallback(async () => {
    setBusy(true);
    try {
      const result = await ipcBridge.fs.restoreSkillVersion.invoke({
        skill_id: skillId,
        version_no: version.version_no,
      });
      void mutate(`skills.source.${skillId}`);
      if (!result.changed) {
        Message.info(t('settings.skillsHub.sourceSection.restoreNoChange', { version: version.version_no }));
        return;
      }
      void mutate('skills.list');
      const args = { from: result.restored_from, version: result.version.version_no };
      if (result.skill.review_status === 'pending') {
        void mutate(PENDING_SKILL_REVIEWS_KEY);
        Message.warning(t('settings.skillsHub.sourceSection.restoredNeedsReview', args));
      } else {
        Message.success(t('settings.skillsHub.sourceSection.restored', args));
      }
    } catch (err) {
      Message.error(t(skillReviewErrorKey(err)));
    } finally {
      setBusy(false);
    }
  }, [skillId, t, version.version_no]);

  const confirm = useCallback(() => {
    Modal.confirm({
      title: t('settings.skillsHub.sourceSection.restoreTitle', { version: version.version_no }),
      content: (
        <div className='flex flex-col gap-6px'>
          <div>{t('settings.skillsHub.sourceSection.restoreContent', { version: version.version_no })}</div>
          {version.has_scripts && (
            <div className='text-danger'>{t('settings.skillsHub.sourceSection.restoreScripts')}</div>
          )}
        </div>
      ),
      okText: t('settings.skillsHub.sourceSection.restore'),
      onOk: () => restore(),
    });
  }, [restore, t, version.has_scripts, version.version_no]);

  return (
    <Button
      size='mini'
      type='text'
      loading={busy}
      onClick={confirm}
      data-testid={`skill-version-restore-${version.version_no}`}
    >
      {t('settings.skillsHub.sourceSection.restore')}
    </Button>
  );
};
