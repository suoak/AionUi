/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure model behind `AnnotatableDiff`: unified diff → rows with old/new line
 * numbers (via diff2html `parse`), hunk-bounded selection, the diff context
 * Core anchors from, and thread placement. No React, no I/O.
 */

import type { ReviewDiffContext, ReviewSide, ReviewThread } from '@/common/types/agent/taskSession';
import { parse } from 'diff2html';

export type DiffLineKind = 'insert' | 'delete' | 'context';

export type DiffHunkRow = { kind: 'hunk'; key: string; hunkIndex: number; header: string };
export type DiffLineRow = {
  kind: 'line';
  key: string;
  /** Index into `DiffFileModel.rows`. */
  index: number;
  hunkIndex: number;
  lineType: DiffLineKind;
  oldNumber?: number;
  newNumber?: number;
  /** Line text without the `+`/`-`/` ` prefix. */
  text: string;
};
export type DiffRow = DiffHunkRow | DiffLineRow;

export type DiffFileModel = {
  /** New path (old path for deletions); `/dev/null` stripped. */
  filePath: string;
  oldPath: string;
  isBinary: boolean;
  rows: DiffRow[];
};

/** Number of context lines sent with a selection (matches Core's anchor). */
export const CONTEXT_LINES = 3;

const stripPrefix = (content: string): string => (content.length > 0 ? content.slice(1) : content);
const cleanName = (name: string | undefined): string => (name && name !== '/dev/null' ? name : '');

/** Parse a unified diff into per-file row models. */
export const parseDiffModel = (patch: string): DiffFileModel[] =>
  parse(patch).map((file, fileIndex) => {
    const rows: DiffRow[] = [];
    file.blocks.forEach((block, hunkIndex) => {
      rows.push({ kind: 'hunk', key: `${fileIndex}:h${hunkIndex}`, hunkIndex, header: block.header });
      block.lines.forEach((line, lineIndex) => {
        rows.push({
          kind: 'line',
          key: `${fileIndex}:h${hunkIndex}:l${lineIndex}`,
          index: rows.length,
          hunkIndex,
          lineType: line.type as DiffLineKind,
          oldNumber: line.oldNumber,
          newNumber: line.newNumber,
          text: stripPrefix(line.content),
        });
      });
    });
    const newName = cleanName(file.newName);
    const oldName = cleanName(file.oldName);
    return {
      filePath: newName || oldName,
      oldPath: oldName || newName,
      isBinary: file.isBinary === true,
      rows,
    };
  });

/** Side a row is annotated on: the new side whenever the row exists there. */
export const rowSide = (row: DiffLineRow): ReviewSide => (row.newNumber !== undefined ? 'new' : 'old');

const sideNumber = (row: DiffLineRow, side: ReviewSide): number | undefined =>
  side === 'new' ? row.newNumber : row.oldNumber;

export type DiffSelection = {
  side: ReviewSide;
  hunkIndex: number;
  /** Row index range in `rows` (inclusive), anchor-first order normalized. */
  fromIndex: number;
  toIndex: number;
  startLine: number;
  endLine: number;
};

const lineRow = (rows: DiffRow[], index: number): DiffLineRow | undefined => {
  const row = rows[index];
  return row?.kind === 'line' ? row : undefined;
};

/**
 * Selection from `anchorIndex` to `focusIndex`, clamped to the anchor's hunk:
 * a drag (or Shift-click) that crosses into another hunk stops at the hunk
 * edge. The side comes from the anchor row; rows without a number on that side
 * (e.g. deletions inside a new-side selection) are skipped for the line range.
 */
export const selectRange = (rows: DiffRow[], anchorIndex: number, focusIndex: number): DiffSelection | undefined => {
  const anchor = lineRow(rows, anchorIndex);
  if (!anchor) return undefined;
  const side = rowSide(anchor);
  const step = focusIndex >= anchorIndex ? 1 : -1;
  let edge = anchorIndex;
  for (let i = anchorIndex + step; step > 0 ? i <= focusIndex : i >= focusIndex; i += step) {
    const row = rows[i];
    if (!row || row.kind !== 'line' || row.hunkIndex !== anchor.hunkIndex) break;
    edge = i;
  }
  const fromIndex = Math.min(anchorIndex, edge);
  const toIndex = Math.max(anchorIndex, edge);
  const numbers: number[] = [];
  for (let i = fromIndex; i <= toIndex; i++) {
    const row = lineRow(rows, i);
    const n = row ? sideNumber(row, side) : undefined;
    if (n !== undefined) numbers.push(n);
  }
  if (numbers.length === 0) return undefined;
  return {
    side,
    hunkIndex: anchor.hunkIndex,
    fromIndex,
    toIndex,
    startLine: Math.min(...numbers),
    endLine: Math.max(...numbers),
  };
};

/** Rows of one hunk that exist on `side`, in order. */
const sideRows = (rows: DiffRow[], hunkIndex: number, side: ReviewSide): DiffLineRow[] =>
  rows.filter(
    (row): row is DiffLineRow =>
      row.kind === 'line' && row.hunkIndex === hunkIndex && sideNumber(row, side) !== undefined
  );

/** The diff context Core anchors a new thread from (`diff_context`). */
export const buildDiffContext = (rows: DiffRow[], selection: DiffSelection, base?: string): ReviewDiffContext => {
  const hunk = rows.find((row): row is DiffHunkRow => row.kind === 'hunk' && row.hunkIndex === selection.hunkIndex);
  const onSide = sideRows(rows, selection.hunkIndex, selection.side);
  const number = (row: DiffLineRow) => sideNumber(row, selection.side) ?? 0;
  const inRange = onSide.filter((row) => number(row) >= selection.startLine && number(row) <= selection.endLine);
  const before = onSide.filter((row) => number(row) < selection.startLine).slice(-CONTEXT_LINES);
  const after = onSide.filter((row) => number(row) > selection.endLine).slice(0, CONTEXT_LINES);
  return {
    hunk_header: hunk?.header,
    ...(base ? { base } : {}),
    before: before.map((row) => row.text),
    lines: inRange.map((row) => row.text),
    after: after.map((row) => row.text),
  };
};

/** Whether a thread counts as unresolved (resolved is the only closed state). */
export const isUnresolved = (thread: Pick<ReviewThread, 'status'>): boolean => thread.status !== 'resolved';

export const countUnresolved = (threads: Pick<ReviewThread, 'status'>[]): number => threads.filter(isUnresolved).length;

/**
 * Where each thread is pinned: the key of the row that shows its last line on
 * its side. Threads whose line is not in this diff (re-anchored outside the
 * hunks, or outdated) go to `detached`.
 */
export const placeThreads = (
  rows: DiffRow[],
  threads: ReviewThread[]
): { byRow: Map<string, ReviewThread[]>; detached: ReviewThread[] } => {
  const byRow = new Map<string, ReviewThread[]>();
  const detached: ReviewThread[] = [];
  for (const thread of threads) {
    const row =
      thread.status === 'outdated'
        ? undefined
        : rows.find(
            (candidate): candidate is DiffLineRow =>
              candidate.kind === 'line' && sideNumber(candidate, thread.side) === thread.end_line
          );
    if (!row) {
      detached.push(thread);
      continue;
    }
    const list = byRow.get(row.key) ?? [];
    list.push(thread);
    byRow.set(row.key, list);
  }
  return { byRow, detached };
};

/** Whether a row index lies inside a selection's row range. */
export const inSelection = (selection: DiffSelection | undefined, index: number): boolean =>
  !!selection && index >= selection.fromIndex && index <= selection.toIndex;
