/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { ReviewThread } from '@/common/types/agent/taskSession';
import { Button, Message, Tag, Tooltip } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import classNames from 'classnames';
import 'diff2html/bundles/css/diff2html.min.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './AnnotatableDiff.module.css';
import {
  buildDiffContext,
  countUnresolved,
  inSelection,
  parseDiffModel,
  placeThreads,
  selectRange,
  type DiffLineRow,
  type DiffSelection,
} from './annotateModel';
import CommentComposer from './CommentComposer';
import ThreadBubble from './ThreadBubble';
import { useReviewThreads, type ReviewScope } from './useReviewThreads';

type Props = {
  /** Unified diff of (at least) `scope.file_path`. */
  patch: string;
  /** Annotation scope; without one the diff renders read-only. */
  scope?: ReviewScope;
  readOnly?: boolean;
  className?: string;
};

const readDocumentTheme = (): 'light' | 'dark' =>
  document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

const useDocumentTheme = (): 'light' | 'dark' => {
  const [theme, setTheme] = useState<'light' | 'dark'>(readDocumentTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readDocumentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return theme;
};

const LINE_CLASS: Record<DiffLineRow['lineType'], string> = {
  insert: 'd2h-ins',
  delete: 'd2h-del',
  context: 'd2h-cntx',
};
const LINE_PREFIX: Record<DiffLineRow['lineType'], string> = { insert: '+', delete: '-', context: ' ' };

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName));

/**
 * Line-annotatable unified diff (design E4 §2.1 / §4.1).
 *
 * Rows are drawn by React from diff2html's `parse()` model (keeping
 * diff2html's CSS classes), so each line gets a gutter "+", hunk-bounded
 * drag / Shift-click range selection, `C` to annotate the hovered line, and
 * thread bubbles pinned under their last line. Threads come from Core, which
 * re-anchors them against the current file on every fetch.
 */
const AnnotatableDiff: React.FC<Props> = ({ patch, scope, readOnly: readOnlyProp, className }) => {
  const { t } = useTranslation();
  const theme = useDocumentTheme();
  const files = useMemo(() => parseDiffModel(patch), [patch]);
  const file = useMemo(
    () => files.find((candidate) => candidate.filePath === scope?.file_path) ?? files[0],
    [files, scope?.file_path]
  );
  const rows = file?.rows ?? [];
  const review = useReviewThreads(scope);
  // Annotating needs a loaded thread list: until then (or on a Core without the
  // review API) the diff is a plain read-only diff with no annotation entry.
  const readOnly = readOnlyProp || !scope || !file || file.isBinary || !review.ready;
  const { byRow, detached } = useMemo(() => placeThreads(rows, review.threads), [rows, review.threads]);
  const unresolved = countUnresolved(review.threads);

  const [selection, setSelection] = useState<DiffSelection>();
  const [composing, setComposing] = useState(false);
  const [hovered, setHovered] = useState<number>();
  const dragAnchor = useRef<number | undefined>(undefined);
  const lastAnchor = useRef<number | undefined>(undefined);

  const cancel = useCallback(() => {
    setSelection(undefined);
    setComposing(false);
    dragAnchor.current = undefined;
  }, []);

  // Reset when the diff itself changes (new revision, other file).
  useEffect(() => cancel(), [patch, cancel]);

  // A drag ends wherever the mouse is released.
  useEffect(() => {
    const onUp = () => {
      if (dragAnchor.current === undefined) return;
      dragAnchor.current = undefined;
      setComposing(true);
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  const startAt = (index: number, extend: boolean) => {
    if (readOnly) return;
    const anchor = extend && lastAnchor.current !== undefined ? lastAnchor.current : index;
    const next = selectRange(rows, anchor, index);
    if (!next) return;
    lastAnchor.current = anchor;
    setSelection(next);
    if (extend) {
      setComposing(true);
    } else {
      dragAnchor.current = index;
      setComposing(false);
    }
  };

  const extendTo = (index: number) => {
    setHovered(index);
    if (dragAnchor.current === undefined) return;
    const next = selectRange(rows, dragAnchor.current, index);
    if (next) setSelection(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (readOnly || isTypingTarget(event.target)) return;
    if (event.key === 'Escape' && selection) {
      event.preventDefault();
      cancel();
      return;
    }
    if ((event.key === 'c' || event.key === 'C') && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (hovered === undefined) return;
      const next = selectRange(rows, hovered, hovered);
      if (!next) return;
      event.preventDefault();
      lastAnchor.current = hovered;
      setSelection(next);
      setComposing(true);
    }
  };

  const submit = async (body: string): Promise<boolean> => {
    if (!selection) return false;
    try {
      await review.create({
        side: selection.side,
        start_line: selection.startLine,
        end_line: selection.endLine,
        body,
        diff_context: buildDiffContext(rows, selection, scope?.base),
      });
      cancel();
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

  const guard = async (action: () => Promise<unknown>): Promise<boolean> => {
    try {
      await action();
      return true;
    } catch {
      Message.error(t('preview.annotate.saveFailed'));
      return false;
    }
  };

  const bubble = (thread: ReviewThread, showSnippet = false) => (
    <ThreadBubble
      key={thread.id}
      thread={thread}
      readOnly={readOnly}
      showSnippet={showSnippet}
      onResolve={(id) => guard(() => review.resolve(id))}
      onReopen={(id) => guard(() => review.reopen(id))}
      onReply={(id, body) => guard(() => review.reply(id, body))}
      onDelete={(id) => guard(() => review.remove(id))}
    />
  );

  if (!file) {
    return <div className='p-16px text-t-secondary text-13px'>{t('preview.annotate.emptyDiff')}</div>;
  }

  return (
    <div
      className={classNames(styles.root, 'flex flex-col min-w-0', className)}
      data-annotatable-diff=''
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseLeave={() => setHovered(undefined)}
    >
      <div className={styles.toolbar}>
        <span className='truncate text-12px text-t-primary'>{file.filePath}</span>
        {scope && review.ready ? (
          <Tag size='small' color={unresolved > 0 ? 'orangered' : 'gray'} data-review-unresolved={unresolved}>
            {t('preview.annotate.unresolved', { count: unresolved })}
          </Tag>
        ) : null}
      </div>
      {review.error ? <div className={styles.notice}>{t('preview.annotate.loadFailed')}</div> : null}
      {detached.length > 0 ? (
        <div className={styles.detached} data-review-detached=''>
          <div className='text-12px text-t-secondary mb-6px'>{t('preview.annotate.detachedTitle')}</div>
          {detached.map((thread) => bubble(thread, true))}
        </div>
      ) : null}
      <div className={classNames('d2h-wrapper', styles.scroller, { 'd2h-dark-color-scheme': theme === 'dark' })}>
        <div className='d2h-file-wrapper'>
          <table className={classNames('d2h-diff-table', styles.table)}>
            <tbody className='d2h-diff-tbody'>
              {rows.map((row) => {
                if (row.kind === 'hunk') {
                  return (
                    <tr key={row.key} data-diff-hunk={row.hunkIndex}>
                      <td className={classNames('d2h-code-linenumber d2h-info', styles.num)} colSpan={3} />
                      <td className={classNames('d2h-info', styles.code)}>{row.header}</td>
                    </tr>
                  );
                }
                const selected = inSelection(selection, row.index);
                const pinned = byRow.get(row.key) ?? [];
                const showComposer = composing && selection?.toIndex === row.index;
                return (
                  <React.Fragment key={row.key}>
                    <tr
                      data-diff-row={row.index}
                      data-diff-old={row.oldNumber}
                      data-diff-new={row.newNumber}
                      data-selected={selected ? 'true' : undefined}
                      className={classNames(styles.row, { [styles.selected]: selected })}
                      onMouseEnter={() => extendTo(row.index)}
                    >
                      <td className={classNames('d2h-code-linenumber', LINE_CLASS[row.lineType], styles.num)}>
                        {row.oldNumber ?? ''}
                      </td>
                      <td className={classNames('d2h-code-linenumber', LINE_CLASS[row.lineType], styles.num)}>
                        {row.newNumber ?? ''}
                      </td>
                      <td className={classNames(LINE_CLASS[row.lineType], styles.gutter)}>
                        {readOnly ? null : (
                          <Tooltip mini content={t('preview.annotate.addComment')}>
                            <Button
                              size='mini'
                              type='text'
                              className={styles.add}
                              aria-label={t('preview.annotate.addComment')}
                              icon={<Plus theme='outline' size='12' />}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                startAt(row.index, event.shiftKey);
                              }}
                            />
                          </Tooltip>
                        )}
                      </td>
                      <td className={classNames(LINE_CLASS[row.lineType], styles.code)}>
                        <span className={styles.prefix}>{LINE_PREFIX[row.lineType]}</span>
                        {row.text}
                      </td>
                    </tr>
                    {showComposer || pinned.length > 0 ? (
                      <tr>
                        <td colSpan={4} className={styles.attach}>
                          {pinned.map((thread) => bubble(thread))}
                          {showComposer ? (
                            <div className={styles.bubble} data-review-new=''>
                              <div className='text-12px text-t-secondary px-8px pt-6px'>
                                {selection.startLine === selection.endLine
                                  ? t('preview.annotate.line', { line: selection.startLine })
                                  : t('preview.annotate.lines', {
                                      start: selection.startLine,
                                      end: selection.endLine,
                                    })}
                              </div>
                              <CommentComposer
                                placeholder={t('preview.annotate.placeholder')}
                                submitLabel={t('preview.annotate.save')}
                                onSubmit={submit}
                                onCancel={cancel}
                              />
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AnnotatableDiff;
