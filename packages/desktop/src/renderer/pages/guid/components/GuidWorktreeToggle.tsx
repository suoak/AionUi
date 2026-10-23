/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Popover, Radio, Select, Tooltip } from '@arco-design/web-react';
import { FANOUT_MAX_SLOTS, FANOUT_MIN_SLOTS, FANOUT_SLOT_LABELS } from '@/common/types/fanout';
import { BranchOne, Delete, Plus, SettingTwo, SplitBranch } from '@icon-park/react';
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
  /** Core ships `/api/fanout-groups` (E3-5): offer the Fan-out choice. */
  fanoutSupported?: boolean;
  /** Assistants a slot can use (the Guid pill bar's catalog). */
  fanoutCandidates?: { id: string; name: string }[];
  /** One assistant id per slot. */
  fanoutAssistantIds?: string[];
  onFanoutAssistantIdsChange?: (ids: string[]) => void;
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
  fanoutSupported,
  fanoutCandidates = [],
  fanoutAssistantIds = [],
  onFanoutAssistantIdsChange,
}) => {
  const { t } = useTranslation();
  const isWorktree = mode === 'worktree';
  const isFanout = mode === 'fanout' && Boolean(fanoutSupported);

  const setSlot = (index: number, id: string) =>
    onFanoutAssistantIdsChange?.(fanoutAssistantIds.map((value, i) => (i === index ? id : value)));
  const addSlot = () =>
    onFanoutAssistantIdsChange?.([...fanoutAssistantIds, fanoutAssistantIds[0] ?? fanoutCandidates[0]?.id ?? '']);
  const removeSlot = (index: number) => onFanoutAssistantIdsChange?.(fanoutAssistantIds.filter((_, i) => i !== index));

  const fanoutOptions = (
    <div className='flex w-300px flex-col gap-10px' data-testid='guid-fanout-options'>
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
      <div className='flex flex-col gap-6px text-12px text-t-secondary'>
        <span>{t('conversation.fanout.slots')}</span>
        {fanoutAssistantIds.map((id, index) => (
          <div key={index} className='flex items-center gap-6px' data-testid='guid-fanout-slot'>
            <span className='w-14px text-center font-medium text-t-primary'>{FANOUT_SLOT_LABELS[index]}</span>
            <Select
              size='small'
              className='flex-1'
              value={id || undefined}
              onChange={(value: string) => setSlot(index, value)}
              options={fanoutCandidates.map((item) => ({ label: item.name, value: item.id }))}
              placeholder={t('conversation.fanout.pickAssistant')}
            />
            <Button
              size='mini'
              type='text'
              disabled={fanoutAssistantIds.length <= FANOUT_MIN_SLOTS}
              aria-label={t('conversation.fanout.removeSlot')}
              icon={<Delete theme='outline' size='12' fill='currentColor' />}
              onClick={() => removeSlot(index)}
            />
          </div>
        ))}
        <Button
          size='mini'
          type='text'
          className='self-start'
          disabled={fanoutAssistantIds.length >= FANOUT_MAX_SLOTS}
          icon={<Plus theme='outline' size='12' fill='currentColor' />}
          onClick={addSlot}
        >
          {t('conversation.fanout.addSlot', { max: FANOUT_MAX_SLOTS })}
        </Button>
      </div>
      <div className='flex flex-col gap-2px text-11px leading-16px text-t-tertiary' data-testid='guid-fanout-estimate'>
        <span>{t('conversation.fanout.estimate', { count: fanoutAssistantIds.length })}</span>
        <span>{t('conversation.fanout.estimateTokens')}</span>
        <span>{t('conversation.fanout.permissionHint')}</span>
      </div>
    </div>
  );

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
        value={isFanout ? 'fanout' : isWorktree ? 'worktree' : 'local'}
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
        {fanoutSupported && (
          <Radio value='fanout'>
            <Tooltip content={t('conversation.fanout.modeTip')} position='top'>
              <span className='inline-flex items-center gap-4px'>
                <SplitBranch theme='outline' size='12' fill='currentColor' />
                {t('conversation.fanout.mode')}
              </span>
            </Tooltip>
          </Radio>
        )}
      </Radio.Group>
      {isFanout && (
        <Popover trigger='click' position='top' content={fanoutOptions} defaultPopupVisible>
          <Button
            size='mini'
            type='text'
            disabled={disabled}
            aria-label={t('conversation.fanout.options')}
            icon={<SettingTwo theme='outline' size='12' fill='currentColor' />}
          />
        </Popover>
      )}
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
