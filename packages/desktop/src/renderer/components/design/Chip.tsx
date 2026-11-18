/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tag } from '@arco-design/web-react';
import type { Icon } from '@icon-park/react/es/runtime';
import React from 'react';
import { useTranslation } from 'react-i18next';
import WmIcon from './WmIcon';

export type ChipProps = {
  label: string;
  icon?: Icon;
  /** `accent` for @agents and skills, `default` for files and other context. */
  tone?: 'default' | 'accent';
  /** Makes the chip removable. */
  onRemove?: () => void;
  title?: string;
  className?: string;
};

/** Removable context chip used in the composer (files, @agents, skills). */
const Chip: React.FC<ChipProps> = ({ label, icon, tone = 'default', onRemove, title, className }) => {
  const { t } = useTranslation();
  const toneClass =
    tone === 'accent'
      ? '!bg-wm-accent-subtle !text-wm-accent !border-transparent'
      : '!bg-wm-raised !text-t-secondary !border-wm-border-default';
  return (
    <Tag
      size='small'
      bordered
      closable={Boolean(onRemove)}
      onClose={onRemove}
      icon={icon ? <WmIcon icon={icon} size={12} /> : undefined}
      title={title ?? label}
      aria-label={onRemove ? `${label}, ${t('common.remove')}` : label}
      className={['!rd-[var(--wm-radius-control)] max-w-220px', toneClass, className].filter(Boolean).join(' ')}
    >
      <span className='truncate'>{label}</span>
    </Tag>
  );
};

export default Chip;
