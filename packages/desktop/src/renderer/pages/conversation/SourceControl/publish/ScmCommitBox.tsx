/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Checkbox, Input } from '@arco-design/web-react';
import { Check } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { setCommitDraft, setNoVerify } from './scmPublishStore';
import type { ScmPublishControls } from './useScmPublish';

/**
 * Commit message + commit button. Commits the **staged** changes only; with
 * nothing staged the hook asks before staging everything. When the repository
 * has commit hooks the box says so and offers `--no-verify`, off by default and
 * reset after every successful commit.
 */
export const ScmCommitBox: React.FC<{ repoId: string; controls: ScmPublishControls }> = ({ repoId, controls }) => {
  const { t } = useTranslation();
  const { state, hooks, canSubmit, commit, stagedCount } = controls;
  const committing = state.phase === 'committing';

  return (
    <div data-scm-commit-box className='flex flex-col gap-6px'>
      <Input.TextArea
        data-scm-commit-message
        value={state.draft}
        autoSize={{ minRows: 1, maxRows: 6 }}
        placeholder={t('conversation.explorer.scm.publish.messagePlaceholder')}
        disabled={committing}
        onChange={(value) => setCommitDraft(repoId, value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            commit();
          }
        }}
      />
      {hooks.length > 0 && (
        <div data-scm-commit-hooks className='flex items-center justify-between gap-8px text-12px text-t-secondary'>
          <span className='truncate' title={hooks.join(', ')}>
            {t('conversation.explorer.scm.publish.hooksWillRun', { hooks: hooks.join(', ') })}
          </span>
          <Checkbox
            data-scm-no-verify
            checked={state.noVerify}
            disabled={committing}
            onChange={(checked) => setNoVerify(repoId, checked)}
          >
            <span className='text-12px'>{t('conversation.explorer.scm.publish.noVerify')}</span>
          </Checkbox>
        </div>
      )}
      <Button
        data-scm-commit-button
        type='primary'
        size='small'
        long
        icon={<Check theme='outline' size='14' />}
        loading={committing}
        disabled={!canSubmit}
        onClick={commit}
      >
        {stagedCount > 0
          ? t('conversation.explorer.scm.publish.commitStaged', { count: stagedCount })
          : t('conversation.explorer.scm.publish.commit')}
      </Button>
    </div>
  );
};
