import { describe, expect, it } from 'vitest';
import type { ReviewThread } from '@/common/types/agent/taskSession';
import {
  buildDiffContext,
  countUnresolved,
  parseDiffModel,
  placeThreads,
  selectRange,
  type DiffLineRow,
  type DiffRow,
} from '@/renderer/pages/conversation/Preview/components/annotate';
import { scmReviewScopeId } from '@/renderer/pages/conversation/SourceControl/scmModel';

// Two hunks: lines 1-6 (one deletion, two insertions) and 20-23.
const PATCH = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 111..222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,5 +1,6 @@',
  ' line1',
  ' line2',
  '-old3',
  '+new3',
  '+new4',
  ' line4',
  ' line5',
  '@@ -20,3 +21,4 @@ function tail() {',
  ' t20',
  '+t21',
  ' t21',
  ' t22',
  '',
].join('\n');

const lines = (rows: DiffRow[]) => rows.filter((row): row is DiffLineRow => row.kind === 'line');

const thread = (over: Partial<ReviewThread>): ReviewThread => ({
  id: 't1',
  scope_kind: 'scm',
  scope_id: 'pe:pe1',
  file_path: 'src/a.ts',
  side: 'new',
  start_line: 1,
  end_line: 1,
  status: 'open',
  moved_fuzzy: false,
  anchor: { v: 1, before: [], lines: [], after: [] },
  comments: [],
  created_at: 1,
  updated_at: 1,
  ...over,
});

describe('parseDiffModel', () => {
  it('maps diff2html lines to old/new line numbers per hunk', () => {
    const [file] = parseDiffModel(PATCH);
    expect(file.filePath).toBe('src/a.ts');
    expect(file.rows.filter((row) => row.kind === 'hunk')).toHaveLength(2);
    expect(
      lines(file.rows).map((row) => [
        row.hunkIndex,
        row.lineType,
        row.oldNumber ?? null,
        row.newNumber ?? null,
        row.text,
      ])
    ).toEqual([
      [0, 'context', 1, 1, 'line1'],
      [0, 'context', 2, 2, 'line2'],
      [0, 'delete', 3, null, 'old3'],
      [0, 'insert', null, 3, 'new3'],
      [0, 'insert', null, 4, 'new4'],
      [0, 'context', 4, 5, 'line4'],
      [0, 'context', 5, 6, 'line5'],
      [1, 'context', 20, 21, 't20'],
      [1, 'insert', null, 22, 't21'],
      [1, 'context', 21, 23, 't21'],
      [1, 'context', 22, 24, 't22'],
    ]);
    // Row indices point back into `rows`.
    for (const row of lines(file.rows)) expect(file.rows[row.index]).toBe(row);
  });

  it('returns no files for an empty patch', () => {
    expect(parseDiffModel('')).toEqual([]);
  });
});

describe('selectRange', () => {
  const [{ rows }] = parseDiffModel(PATCH);
  const rowOf = (newNumber: number) => lines(rows).find((row) => row.newNumber === newNumber)!.index;
  const rowOfOld = (oldNumber: number) => lines(rows).find((row) => row.oldNumber === oldNumber)!.index;

  it('selects a new-side range and skips deleted rows for the line range', () => {
    const selection = selectRange(rows, rowOf(2), rowOf(4));
    expect(selection).toMatchObject({ side: 'new', hunkIndex: 0, startLine: 2, endLine: 4 });
  });

  it('normalizes a backwards drag', () => {
    expect(selectRange(rows, rowOf(5), rowOf(1))).toMatchObject({ startLine: 1, endLine: 5 });
  });

  it('clamps a selection that crosses into another hunk at the hunk edge', () => {
    const selection = selectRange(rows, rowOf(5), rowOf(23));
    expect(selection).toMatchObject({ side: 'new', hunkIndex: 0, startLine: 5, endLine: 6 });
    expect(selection!.toIndex).toBe(rowOf(6));
    // And from the second hunk upwards.
    expect(selectRange(rows, rowOf(22), rowOf(1))).toMatchObject({ hunkIndex: 1, startLine: 21, endLine: 22 });
  });

  it('anchors a deletion on the old side', () => {
    expect(selectRange(rows, rowOfOld(3), rowOfOld(3))).toMatchObject({ side: 'old', startLine: 3, endLine: 3 });
  });

  it('rejects a hunk header as anchor', () => {
    expect(selectRange(rows, 0, 2)).toBeUndefined();
  });
});

describe('buildDiffContext', () => {
  const [{ rows }] = parseDiffModel(PATCH);
  const rowOf = (newNumber: number) => lines(rows).find((row) => row.newNumber === newNumber)!.index;

  it('sends the selected side lines with up to three context lines and the base', () => {
    const selection = selectRange(rows, rowOf(3), rowOf(4))!;
    expect(buildDiffContext(rows, selection, 'WORKTREE')).toEqual({
      hunk_header: '@@ -1,5 +1,6 @@',
      base: 'WORKTREE',
      before: ['line1', 'line2'],
      lines: ['new3', 'new4'],
      after: ['line4', 'line5'],
    });
  });

  it('keeps line count equal to the selected range and omits a missing base', () => {
    const selection = selectRange(rows, rowOf(1), rowOf(6))!;
    const context = buildDiffContext(rows, selection);
    expect(context.lines).toHaveLength(selection.endLine - selection.startLine + 1);
    expect(context).not.toHaveProperty('base');
  });
});

describe('thread placement and counts', () => {
  const [{ rows }] = parseDiffModel(PATCH);

  it('pins threads under their last line and detaches the rest', () => {
    const pinned = thread({ id: 'a', start_line: 3, end_line: 4 });
    const old = thread({ id: 'b', side: 'old', start_line: 3, end_line: 3 });
    const outside = thread({ id: 'c', start_line: 10, end_line: 10 });
    const outdated = thread({ id: 'd', status: 'outdated', start_line: 1, end_line: 1 });
    const { byRow, detached } = placeThreads(rows, [pinned, old, outside, outdated]);
    const keyOf = (pick: (row: DiffLineRow) => boolean) => lines(rows).find(pick)!.key;
    expect(byRow.get(keyOf((row) => row.newNumber === 4))).toEqual([pinned]);
    expect(byRow.get(keyOf((row) => row.lineType === 'delete'))).toEqual([old]);
    expect(detached.map((item) => item.id)).toEqual(['c', 'd']);
  });

  it('counts every status except resolved as unresolved', () => {
    expect(
      countUnresolved([
        thread({ status: 'open' }),
        thread({ status: 'sent' }),
        thread({ status: 'outdated' }),
        thread({ status: 'resolved' }),
      ])
    ).toBe(3);
  });
});

describe('scmReviewScopeId', () => {
  it('names a repository by its pe root', () => {
    expect(scmReviewScopeId('pe1', '')).toBe('pe:pe1');
    expect(scmReviewScopeId('pe1', 'feature')).toBe('pe:pe1/feature');
    expect(scmReviewScopeId('pe1', '\\nested\\wt\\')).toBe('pe:pe1/nested/wt');
  });
});
