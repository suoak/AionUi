/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Down, Right } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * 3.0 U8: Squad hand-off and other rarely used controls sit behind an
 * "Advanced" disclosure. It opens by itself when the task already runs with a
 * Squad, so that state is never hidden.
 */
const TaskDetailAdvanced: React.FC<{ taskId: string; defaultOpen: boolean; children: React.ReactNode }> = ({
  taskId,
  defaultOpen,
  children,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    setOpen(defaultOpen);
    // Reset only when another task opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);
  return (
    <section className='flex flex-col gap-10px' data-testid='task-detail-advanced'>
      <button
        type='button'
        className='self-start flex items-center gap-4px bg-transparent border-none p-0 cursor-pointer text-13px font-medium text-t-secondary'
        aria-expanded={open}
        data-testid='task-detail-advanced-toggle'
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <Down theme='outline' size='12' /> : <Right theme='outline' size='12' className='rtl:rotate-180' />}
        {t('conversation.taskBoard.advanced.title')}
      </button>
      {open ? <div className='flex flex-col gap-16px'>{children}</div> : null}
    </section>
  );
};

export default TaskDetailAdvanced;
