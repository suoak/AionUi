import type { TrajectoryRecord } from '@/common/types/journalTranscript';

export type VisibleTrajectoryRecord = { record: TrajectoryRecord; depth: number; hasChildren: boolean };

/** Build a stable pre-order tree while keeping partial-page orphans visible. */
export function buildVisibleTrajectoryRecords(
  records: TrajectoryRecord[],
  collapsedRecordIds: ReadonlySet<string>
): VisibleTrajectoryRecord[] {
  const recordIds = new Set(records.map((record) => record.record_id));
  const children = new Map<string, TrajectoryRecord[]>();
  const roots: TrajectoryRecord[] = [];
  for (const record of records) {
    const parentId = record.parent_record_id;
    if (!parentId || !recordIds.has(parentId) || parentId === record.record_id) {
      roots.push(record);
      continue;
    }
    const siblings = children.get(parentId) ?? [];
    siblings.push(record);
    children.set(parentId, siblings);
  }

  const visible: VisibleTrajectoryRecord[] = [];
  const visited = new Set<string>();
  const markHidden = (record: TrajectoryRecord) => {
    if (visited.has(record.record_id)) return;
    visited.add(record.record_id);
    for (const child of children.get(record.record_id) ?? []) markHidden(child);
  };
  const append = (record: TrajectoryRecord, depth: number) => {
    if (visited.has(record.record_id)) return;
    visited.add(record.record_id);
    const nested = children.get(record.record_id) ?? [];
    visible.push({ record, depth, hasChildren: nested.length > 0 });
    if (collapsedRecordIds.has(record.record_id)) {
      for (const child of nested) markHidden(child);
    } else for (const child of nested) append(child, depth + 1);
  };
  for (const root of roots) append(root, 0);
  // Cyclic malformed records have no root, but must remain diagnosable.
  for (const record of records) append(record, 0);
  return visible;
}
