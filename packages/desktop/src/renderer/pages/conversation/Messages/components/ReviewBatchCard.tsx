/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { Button } from '@arco-design/web-react';
import { Comment, Down, Up } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReviewBlock } from './reviewMarker';

type Props = { block: ReviewBlock };

/**
 * The user's message carrying a review batch (M7 E4 §2.2): "N notes sent" with
 * each note's file, lines and text; expands to the exact text the agent got.
 */
const ReviewBatchCard: React.FC<Props> = ({ block }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className='min-w-0 flex flex-col gap-6px' data-testid='review-batch-card' data-review-batch={block.batchId}>
      <div className='flex items-center gap-6px'>
        <Comment theme='outline' size={14} fill={iconColors.secondary} />
        <span className='font-500 text-13px text-t-primary'>
          {t('conversation.reviewBatch.title', { count: block.count })}
        </span>
      </div>
      {block.notes.length > 0 ? (
        <ol className='m-0 pl-18px flex flex-col gap-4px text-12px'>
          {block.notes.map((note) => (
            <li key={note.number} value={note.number} className='min-w-0'>
              <div className='text-t-secondary [overflow-wrap:anywhere]'>{note.heading}</div>
              {note.note ? (
                <div className='text-t-primary whitespace-pre-wrap [overflow-wrap:anywhere]'>{note.note}</div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      <div>
        <Button
          size='mini'
          type='text'
          icon={expanded ? <Up size={12} /> : <Down size={12} />}
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? t('conversation.reviewBatch.hideSent') : t('conversation.reviewBatch.showSent')}
        </Button>
      </div>
      {expanded ? (
        <pre
          className='m-0 p-8px rd-4px bg-bg-3 max-h-320px overflow-auto text-12px whitespace-pre-wrap [overflow-wrap:anywhere]'
          data-testid='review-batch-raw'
        >
          {block.raw}
        </pre>
      ) : null}
    </div>
  );
};

export default ReviewBatchCard;
