/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReviewThread } from '@/common/types/agent/taskSession';
import MarkdownView from '@/renderer/components/Markdown';
import { Button, Popconfirm, Tag } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CommentComposer from './CommentComposer';
import styles from './AnnotatableDiff.module.css';

type Props = {
  thread: ReviewThread;
  readOnly?: boolean;
  /** Show the selected code (for threads not pinned to a visible row). */
  showSnippet?: boolean;
  onResolve: (id: string) => Promise<unknown>;
  onReopen: (id: string) => Promise<unknown>;
  onReply: (id: string, body: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<unknown>;
};

const STATUS_COLOR: Record<ReviewThread['status'], string> = {
  open: 'arcoblue',
  sent: 'purple',
  resolved: 'green',
  outdated: 'orange',
};

/** One annotation thread pinned under its last line. */
const ThreadBubble: React.FC<Props> = ({ thread, readOnly, showSnippet, onResolve, onReopen, onReply, onDelete }) => {
  const { t } = useTranslation();
  const [replying, setReplying] = useState(false);
  const resolved = thread.status === 'resolved';
  const range =
    thread.start_line === thread.end_line
      ? t('preview.annotate.line', { line: thread.start_line })
      : t('preview.annotate.lines', { start: thread.start_line, end: thread.end_line });
  const snippet = thread.anchor.original_lines ?? thread.anchor.lines;

  return (
    <div className={styles.bubble} data-review-thread={thread.id} data-review-status={thread.status}>
      <div className='flex items-center justify-between gap-8px'>
        <div className='flex items-center gap-6px min-w-0'>
          <span className='text-12px text-t-secondary'>{range}</span>
          <Tag size='small' color={STATUS_COLOR[thread.status]}>
            {t(`preview.annotate.status.${thread.status}`)}
          </Tag>
          {thread.moved_fuzzy ? (
            <Tag size='small' color='gold'>
              {t('preview.annotate.movedFuzzy')}
            </Tag>
          ) : null}
        </div>
        {readOnly ? null : (
          <div className='flex items-center gap-4px flex-shrink-0'>
            <Button size='mini' type='text' onClick={() => setReplying((open) => !open)}>
              {t('preview.annotate.reply')}
            </Button>
            <Button
              size='mini'
              type='text'
              onClick={() => void (resolved ? onReopen(thread.id) : onResolve(thread.id))}
            >
              {resolved ? t('preview.annotate.reopen') : t('preview.annotate.resolve')}
            </Button>
            <Popconfirm title={t('preview.annotate.deleteConfirm')} onOk={() => void onDelete(thread.id)}>
              <Button size='mini' type='text' status='danger'>
                {t('preview.annotate.delete')}
              </Button>
            </Popconfirm>
          </div>
        )}
      </div>
      {showSnippet || thread.moved_fuzzy ? <pre className={styles.snippet}>{snippet.join('\n')}</pre> : null}
      {thread.comments.map((comment) => (
        <div key={comment.id} className={styles.comment} data-review-comment-author={comment.author}>
          {comment.author === 'agent' ? (
            <span className='text-11px text-t-secondary'>{t('preview.annotate.agentReply')}</span>
          ) : null}
          <MarkdownView hiddenCodeCopyButton>{comment.body}</MarkdownView>
        </div>
      ))}
      {replying ? (
        <CommentComposer
          placeholder={t('preview.annotate.replyPlaceholder')}
          submitLabel={t('preview.annotate.reply')}
          onCancel={() => setReplying(false)}
          onSubmit={async (body) => {
            const ok = await onReply(thread.id, body);
            if (ok) setReplying(false);
            return ok;
          }}
        />
      ) : null}
    </div>
  );
};

export default ThreadBubble;
