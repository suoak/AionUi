/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { Left } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import WmIcon from './WmIcon';

export type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned actions (inline-end in RTL). */
  actions?: React.ReactNode;
  /** Shows a back button before the title. */
  onBack?: () => void;
  className?: string;
};

/** Page title row: optional back, title + description, actions at the inline end. */
const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions, onBack, className }) => {
  const { t } = useTranslation();
  return (
    <header
      data-testid='wm-page-header'
      className={['flex items-start gap-12px pb-16px', className].filter(Boolean).join(' ')}
    >
      {onBack && (
        <Button
          type='text'
          size='small'
          aria-label={t('common.back')}
          onClick={onBack}
          icon={<WmIcon icon={Left} className='rtl:rotate-180' />}
        />
      )}
      <div className='min-w-0 flex-1'>
        <h1 className='m-0 text-20px leading-28px font-semibold text-t-primary truncate'>{title}</h1>
        {description && <p className='m-0 mt-4px text-13px leading-20px text-t-secondary'>{description}</p>}
      </div>
      {actions && <div className='flex shrink-0 items-center gap-8px'>{actions}</div>}
    </header>
  );
};

export default PageHeader;
