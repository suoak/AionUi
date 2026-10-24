/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// M8 E10-2: import skills from a URL / git repo / local directory. Imported
// skills with scripts land in the review queue; nothing is enabled here.

import { ipcBridge } from '@/common';
import type { SkillSourceImportKind, SkillSourceSyncResult } from '@/common/types/skills/skillSources';
import { Input, Message, Modal, Radio } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { skillReviewErrorKey, validateImportLocator } from './skillReviewModel';

type Props = {
  visible: boolean;
  onClose: () => void;
  onImported: (imported: SkillSourceSyncResult[]) => void;
};

const SkillSourceImportModal: React.FC<Props> = ({ visible, onClose, onImported }) => {
  const { t } = useTranslation();
  const [kind, setKind] = useState<SkillSourceImportKind>('git');
  const [locator, setLocator] = useState('');
  const [ref, setRef] = useState('');
  const [subpath, setSubpath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const invalid = validateImportLocator(kind, locator);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { imported } = await ipcBridge.fs.importSkillsFromSource.invoke({
        kind,
        locator: locator.trim(),
        ...(kind === 'git' && ref.trim() ? { ref: ref.trim() } : {}),
        ...(kind !== 'url' && subpath.trim() ? { subpath: subpath.trim() } : {}),
      });
      const pending = imported.filter((r) => r.skill.review_status === 'pending').length;
      Message.success(t('settings.skillsHub.review.import.done', { count: imported.length, pending }));
      onImported(imported);
      onClose();
    } catch (err) {
      setError(skillReviewErrorKey(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      title={t('settings.skillsHub.review.import.title')}
      okText={t('settings.skillsHub.review.import.submit')}
      confirmLoading={submitting}
      onOk={() => void submit()}
      onCancel={onClose}
      unmountOnExit
    >
      <div className='flex flex-col gap-10px' data-testid='skill-source-import'>
        <Radio.Group type='button' value={kind} onChange={(v) => setKind(v as SkillSourceImportKind)}>
          <Radio value='git'>{t('settings.skillsHub.review.import.kindGit')}</Radio>
          <Radio value='url'>{t('settings.skillsHub.review.import.kindUrl')}</Radio>
          <Radio value='local'>{t('settings.skillsHub.review.import.kindLocal')}</Radio>
        </Radio.Group>
        <Input
          value={locator}
          onChange={setLocator}
          placeholder={t(
            kind === 'local'
              ? 'settings.skillsHub.review.import.localPlaceholder'
              : 'settings.skillsHub.review.import.urlPlaceholder'
          )}
          data-testid='skill-source-import-locator'
        />
        {kind === 'git' && (
          <Input value={ref} onChange={setRef} placeholder={t('settings.skillsHub.review.import.refPlaceholder')} />
        )}
        {kind !== 'url' && (
          <Input
            value={subpath}
            onChange={setSubpath}
            placeholder={t('settings.skillsHub.review.import.subpathPlaceholder')}
          />
        )}
        <div className='text-12px text-t-secondary'>{t('settings.skillsHub.review.import.hint')}</div>
        {error && (
          <div className='text-12px text-danger' data-testid='skill-source-import-error'>
            {t(error)}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default SkillSourceImportModal;
