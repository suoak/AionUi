/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Typography } from '@arco-design/web-react';
import React from 'react';

type SettingsMovedRowProps = {
  title: React.ReactNode;
  hint: React.ReactNode;
  openLabel: React.ReactNode;
  onOpen: () => void;
  'data-testid'?: string;
};

/** 3.0 V7: pointer left in System after a section moved to its own settings page. */
const SettingsMovedRow: React.FC<SettingsMovedRowProps> = ({
  title,
  hint,
  openLabel,
  onOpen,
  'data-testid': testId,
}) => (
  <div
    className='py-12px border-t border-[var(--color-border-2)] flex items-center justify-between gap-12px'
    data-testid={testId}
  >
    <div className='min-w-0'>
      <Typography.Title heading={6} className='!m-0'>
        {title}
      </Typography.Title>
      <Typography.Text type='secondary'>{hint}</Typography.Text>
    </div>
    <Button size='small' onClick={onOpen} data-testid={testId ? `${testId}-open` : undefined}>
      {openLabel}
    </Button>
  </div>
);

export default SettingsMovedRow;
