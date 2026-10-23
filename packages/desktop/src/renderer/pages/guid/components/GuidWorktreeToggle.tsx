/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Popover, Radio, Tooltip } from '@arco-design/web-react';
import { BranchOne, SettingTwo } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GuidWorkspaceMode } from '../hooks/useGuidSend';

type GuidWorktreeToggleProps = {
  mode: GuidWorkspaceMode;
  onModeChange: (mode: GuidWorkspaceMode) => void;
  baseRef: string;
  onBaseRefChange: (value: string) => void;
  branch: string;
  onBranchChange: (value: string) => void;
  /** Suggested branch name shown as the placeholder (`wm/<id>-<slug>`). */
  branchPlaceholder: string;
  disabled?: boolean;
};

/**
 * Local / Worktree switch next to the workspace pill (design E3 §4.2). Shown
 * only for a git repository on a Core with the worktree API.
 */
const GuidWorktreeToggle: React.FC<GuidWorktreeToggleProps> = ({
  mode,
  onModeChange,
  baseRef,
  onBaseRefChange,
  branch,
  onBranchChange,
  branchPlaceholder,
  disabled,
}) => {
  const { t } = useTranslation();
  const isWorktree = mode === 'worktree';

  const options = (
    <div className='flex w-260px flex-col gap-10px' data-testid='guid-worktree-options'>
      <label className='flex flex-col gap-4px text-12px text-t-secondary'>
        <span>{t('conversation.worktree.startFrom')}</span>
        <Input
          size='small'
          value={baseRef}
          onChange={onBaseRefChange}
          placeholder={t('conversation.worktree.startFromPlaceholder')}
          allowClear
        />
      </label>
      <label className='flex flex-col gap-4px text-12px text-t-secondary'>
        <span>{t('conversation.worktree.branchName')}</span>
        <Input size='small' value={branch} onChange={onBranchChange} placeholder={branchPlaceholder} allowClear />
      </label>
      <span className='text-11px leading-16px text-t-tertiary'>{t('conversation.worktree.optionsHint')}</span>
    </div>
  );

  return (
    <div className='flex items-center gap-4px' data-testid='guid-worktree-toggle'>
      <Radio.Group
        type='button'
        size='mini'
        value={isWorktree ? 'worktree' : 'local'}
        disabled={disabled}
        onChange={(value: GuidWorkspaceMode) => onModeChange(value)}
      >
        <Radio value='local'>{t('conversation.worktree.modeLocal')}</Radio>
        <Radio value='worktree'>
          <Tooltip content={t('conversation.worktree.modeWorktreeTip')} position='top'>
            <span className='inline-flex items-center gap-4px'>
              <BranchOne theme='outline' size='12' fill='currentColor' />
              {t('conversation.worktree.modeWorktree')}
            </span>
          </Tooltip>
        </Radio>
      </Radio.Group>
      {isWorktree && (
        <Popover trigger='click' position='top' content={options}>
          <Button
            size='mini'
            type='text'
            disabled={disabled}
            aria-label={t('conversation.worktree.advanced')}
            icon={<SettingTwo theme='outline' size='12' fill='currentColor' />}
          />
        </Popover>
      )}
    </div>
  );
};

export default GuidWorktreeToggle;
