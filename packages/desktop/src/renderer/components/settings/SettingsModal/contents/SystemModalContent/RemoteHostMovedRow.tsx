/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

/** 3.0 V7: pointer left in System after Remote Host moved to its own settings page. */
const RemoteHostMovedRow: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { t } = useTranslation();
  return (
    <div
      className='py-12px border-t border-[var(--color-border-2)] flex items-center justify-between gap-12px'
      data-testid='remote-host-moved'
    >
      <div className='min-w-0'>
        <Typography.Title heading={6} className='!m-0'>
          {t('settings.remoteHost.title')}
        </Typography.Title>
        <Typography.Text type='secondary'>{t('settings.remoteHost.movedHint')}</Typography.Text>
      </div>
      <Button size='small' onClick={onOpen} data-testid='remote-host-open-page'>
        {t('settings.remoteHost.openPage')}
      </Button>
    </div>
  );
};

export default RemoteHostMovedRow;
