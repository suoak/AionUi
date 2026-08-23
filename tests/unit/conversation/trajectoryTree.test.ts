import type { TrajectoryRecord } from '@/common/types/journalTranscript';
import { buildVisibleTrajectoryRecords } from '@/renderer/pages/conversation/components/Trajectory/utils/trajectoryTree';
import { describe, expect, it } from 'vitest';

const record = (recordId: string, parentRecordId?: string): TrajectoryRecord => ({
  record_id: recordId,
  category: 'tool',
  status: 'completed',
  visibility: 'host',
  parent_record_id: parentRecordId,
  title: recordId,
  summary: '',
  tokens: {},
  first_sequence: 1,
  last_sequence: 1,
  source_sequences: [1],
});

describe('buildVisibleTrajectoryRecords', () => {
  it('builds parent-child tool records in stable pre-order', () => {
    const visible = buildVisibleTrajectoryRecords(
      [record('parent'), record('sibling'), record('child', 'parent'), record('grandchild', 'child')],
      new Set()
    );
    expect(visible.map(({ record: item, depth }) => [item.record_id, depth])).toEqual([
      ['parent', 0],
      ['child', 1],
      ['grandchild', 2],
      ['sibling', 0],
    ]);
    expect(visible[0]?.hasChildren).toBe(true);
  });

  it('hides every descendant of a collapsed tool record', () => {
    const visible = buildVisibleTrajectoryRecords(
      [record('parent'), record('child', 'parent'), record('grandchild', 'child'), record('sibling')],
      new Set(['parent'])
    );
    expect(visible.map(({ record: item }) => item.record_id)).toEqual(['parent', 'sibling']);
  });

  it('keeps children from a partially loaded page visible as roots', () => {
    const visible = buildVisibleTrajectoryRecords([record('child', 'older-parent')], new Set());
    expect(visible).toMatchObject([{ record: { record_id: 'child' }, depth: 0, hasChildren: false }]);
  });

  it('does not recurse forever when malformed records form a cycle', () => {
    const visible = buildVisibleTrajectoryRecords([record('a', 'b'), record('b', 'a')], new Set());
    expect(visible.map(({ record: item }) => item.record_id)).toEqual(['a', 'b']);
  });
});
