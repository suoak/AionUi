/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { ReviewThread } from '@/common/types/agent/taskSession';
import { Button, Input, InputNumber, Message, Tag } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { countUnresolved } from './annotateModel';
import CommentComposer from './CommentComposer';
import {
  buildOfficeAnchorInput,
  formatOfficeThreadTarget,
  officeUnitLabelKey,
  type OfficeDocKind,
} from './officeReviewModel';
import SendReviewMenu from './SendReviewMenu';
import ThreadBubble from './ThreadBubble';
import { useReviewThreads, type ReviewScope } from './useReviewThreads';

export type OfficeLockedTarget = {
  unitNumber: number;
  unitLabel: string;
  elementLabel?: string;
  snippet?: string;
};

type Props = {
  scope: ReviewScope;
  docType: OfficeDocKind;
  open: boolean;
  onClose: () => void;
  /** PresentationStudio: locked to the selected slide (and optional block). */
  lockedTarget?: OfficeLockedTarget;
  /** OfficeWatchViewer: user picks the Slide / Page / Row # and optional element. */
  interactiveTarget?: boolean;
  /** Jump the host preview to the thread's unit (e.g. a slide). */
  onSelectThread?: (thread: ReviewThread) => void;
};

const OfficeReviewDrawer: React.FC<Props> = ({
  scope,
  docType,
  open,
  onClose,
  lockedTarget,
  interactiveTarget,
  onSelectThread,
}) => {
  const { t } = useTranslation();
  const review = useReviewThreads(scope);
  const [sendOpen, setSendOpen] = useState(false);
  const [unitNumber, setUnitNumber] = useState(Math.max(1, lockedTarget?.unitNumber ?? 1));
  const [elementLabel, setElementLabel] = useState(lockedTarget?.elementLabel ?? '');

  const unresolved = countUnresolved(review.threads);
  const threads = useMemo(
    () =>
      [...review.threads].toSorted(
        (a, b) => a.start_line - b.start_line || a.created_at - b.created_at || a.id.localeCompare(b.id)
      ),
    [review.threads]
  );

  const resolvedTarget = lockedTarget
    ? lockedTarget
    : interactiveTarget
      ? {
          unitNumber,
          unitLabel: t(officeUnitLabelKey(docType)),
          elementLabel: elementLabel.trim() || undefined,
        }
      : undefined;

  const guard = async (action: () => Promise<unknown>): Promise<boolean> => {
    try {
      await action();
      return true;
    } catch {
      Message.error(t('preview.annotate.saveFailed'));
      return false;
    }
  };

  const submit = async (body: string): Promise<boolean> => {
    if (!resolvedTarget) return false;
    const anchor = buildOfficeAnchorInput({
      ...resolvedTarget,
      snippet: resolvedTarget.snippet,
    });
    try {
      await review.create({
        side: anchor.side,
        start_line: anchor.start_line,
        end_line: anchor.end_line,
        body,
        diff_context: anchor.diff_context,
      });
      return true;
    } catch (error) {
      if (isBackendHttpError(error) && error.code === 'ANCHOR_STALE') {
        Message.warning(t('preview.annotate.staleDiff'));
        void review.refresh();
      } else {
        Message.error(t('preview.annotate.saveFailed'));
      }
      return false;
    }
  };

  if (!open || !review.ready) return null;

  const targetBadge = resolvedTarget ? buildOfficeAnchorInput(resolvedTarget).diff_context.hunk_header : undefined;

  return (
    <aside
      className='w-320px shrink-0 border-l border-border-2 bg-bg-1 flex flex-col min-h-0 h-full'
      data-testid='office-review-drawer'
    >
      <div className='h-48px flex-shrink-0 flex items-center gap-8px px-12px border-b border-border-2'>
        <span className='text-13px font-500 truncate'>{t('preview.officeReview.title')}</span>
        <Tag size='small' color={unresolved > 0 ? 'arcoblue' : 'gray'} data-testid='office-review-unresolved'>
          {t('preview.officeReview.unresolvedCount', { count: unresolved })}
        </Tag>
        <div className='flex-1' />
        <Button
          size='mini'
          type='primary'
          disabled={unresolved === 0}
          data-testid='office-review-send'
          onClick={() => setSendOpen(true)}
        >
          {t('preview.officeReview.send', { count: unresolved })}
        </Button>
        <Button
          size='mini'
          type='text'
          icon={<Close />}
          aria-label={t('preview.officeReview.close')}
          data-testid='office-review-close'
          onClick={onClose}
        />
      </div>

      <div className='flex-shrink-0 border-b border-border-2 px-12px py-10px flex flex-col gap-8px'>
        {lockedTarget ? (
          <div className='flex flex-col gap-4px' data-testid='office-review-locked-target'>
            <span className='text-12px text-t-secondary'>{t('preview.officeReview.target')}</span>
            <span className='text-13px text-t-primary' data-testid='office-review-target-badge'>
              {targetBadge}
            </span>
          </div>
        ) : interactiveTarget ? (
          <div className='flex flex-col gap-8px' data-testid='office-review-interactive-target'>
            <label className='flex flex-col gap-4px'>
              <span className='text-12px text-t-secondary'>{t(officeUnitLabelKey(docType))}</span>
              <div data-testid='office-review-unit'>
                <InputNumber
                  min={1}
                  precision={0}
                  value={unitNumber}
                  onChange={(value) => setUnitNumber(Math.max(1, Math.floor(Number(value) || 1)))}
                />
              </div>
            </label>
            <label className='flex flex-col gap-4px'>
              <span className='text-12px text-t-secondary'>{t('preview.officeReview.element')}</span>
              <div data-testid='office-review-element'>
                <Input
                  value={elementLabel}
                  placeholder={t('preview.officeReview.elementPlaceholder')}
                  onChange={setElementLabel}
                />
              </div>
            </label>
          </div>
        ) : null}
        {resolvedTarget ? (
          <CommentComposer
            placeholder={t('preview.officeReview.commentPlaceholder')}
            submitLabel={t('preview.officeReview.commentSubmit')}
            onCancel={() => undefined}
            onSubmit={submit}
          />
        ) : null}
      </div>

      <div className='flex-1 min-h-0 overflow-y-auto px-12px py-10px flex flex-col gap-10px'>
        <span className='text-12px text-t-secondary'>{t('preview.officeReview.threads')}</span>
        {threads.length === 0 ? (
          <span className='text-12px text-t-tertiary' data-testid='office-review-empty'>
            {t('preview.officeReview.empty')}
          </span>
        ) : (
          threads.map((thread) => (
            <div key={thread.id} className='flex flex-col gap-6px' data-testid='office-review-thread'>
              <button
                type='button'
                className='self-start text-12px text-primary px-0 bg-transparent border-0 cursor-pointer'
                data-testid='office-review-thread-target'
                onClick={() => onSelectThread?.(thread)}
              >
                {formatOfficeThreadTarget(thread, docType, t)}
              </button>
              <ThreadBubble
                thread={thread}
                onResolve={(id) => guard(() => review.resolve(id))}
                onReopen={(id) => guard(() => review.reopen(id))}
                onReply={(id, body) => guard(() => review.reply(id, body))}
                onDelete={(id) => guard(() => review.remove(id))}
              />
            </div>
          ))
        )}
      </div>

      <SendReviewMenu visible={sendOpen} scope={scope} onClose={() => setSendOpen(false)} />
    </aside>
  );
};

export default OfficeReviewDrawer;
