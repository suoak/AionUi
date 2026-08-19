import { describe, expect, it } from 'vitest';
import type { JournalTranscriptItem } from '@/common/types/journalTranscript';
import {
  compactionLockI18nKey,
  isHostOnlyItem,
  isTranscriptReconstructible,
  toolExecutionMetadata,
  trajectoryItemPreview,
  trajectoryKindI18nKey,
} from '@/renderer/pages/conversation/components/Trajectory/trajectoryModel';

const item = (overrides: Partial<JournalTranscriptItem> = {}): JournalTranscriptItem => ({
  sequence: 1,
  event_id: 'evt-1',
  journal_kind: 'Text',
  transcript_kind: 'assistant/message',
  visibility: 'model',
  summary: 'hello',
  source_sequences: [1],
  ...overrides,
});

describe('trajectoryKindI18nKey', () => {
  it('maps known journal kinds onto conversation.trajectory labels', () => {
    expect(trajectoryKindI18nKey('assistant/message')).toBe('conversation.trajectory.kind.assistant');
    expect(trajectoryKindI18nKey('user/message')).toBe('conversation.trajectory.kind.user');
    expect(trajectoryKindI18nKey('tool/call')).toBe('conversation.trajectory.kind.tool');
    expect(trajectoryKindI18nKey('turn/start')).toBe('conversation.trajectory.kind.turnStart');
    expect(trajectoryKindI18nKey('turn/end')).toBe('conversation.trajectory.kind.turnEnd');
    expect(trajectoryKindI18nKey('turn/error')).toBe('conversation.trajectory.kind.turnError');
  });

  it('falls back to a host-notice label for unknown kinds', () => {
    expect(trajectoryKindI18nKey('approval/asked')).toBe('conversation.trajectory.kind.hostNotice');
  });
});

describe('compactionLockI18nKey', () => {
  it('keeps open and closed locks distinct', () => {
    expect(compactionLockI18nKey('open')).toBe('conversation.trajectory.lock.open');
    expect(compactionLockI18nKey('closed')).toBe('conversation.trajectory.lock.closed');
  });

  it('treats missing or unknown locks as idle', () => {
    expect(compactionLockI18nKey('')).toBe('conversation.trajectory.lock.none');
    expect(compactionLockI18nKey('crashed')).toBe('conversation.trajectory.lock.none');
  });
});

describe('isTranscriptReconstructible', () => {
  it('treats a missing or true flag as reconstructible', () => {
    expect(isTranscriptReconstructible({ model_surface_reconstructible: true })).toBe(true);
  });

  it('surfaces a failed model-visible contract', () => {
    expect(isTranscriptReconstructible({ model_surface_reconstructible: false })).toBe(false);
  });
});

describe('isHostOnlyItem', () => {
  it('marks host-visible notices as host-only', () => {
    expect(isHostOnlyItem(item({ visibility: 'host' }))).toBe(true);
  });

  it('does not hide model-visible rows', () => {
    expect(isHostOnlyItem(item({ visibility: 'model' }))).toBe(false);
  });
});

describe('trajectoryItemPreview', () => {
  it('prefers reconstructible content over the truncated summary', () => {
    expect(
      trajectoryItemPreview(
        item({
          summary: 'please list…',
          content: 'please list files in the workspace',
        })
      )
    ).toBe('please list files in the workspace');
  });

  it('uses the compacted summary and collapses whitespace', () => {
    expect(
      trajectoryItemPreview(
        item({
          compacted: true,
          summary: 'full   output\n1',
          content: 'stale leftover payload',
        })
      )
    ).toBe('full output 1');
  });

  it('truncates a long reconstructible payload', () => {
    const preview = trajectoryItemPreview(item({ content: 'x'.repeat(200) }));
    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBe(161);
  });
});

describe('toolExecutionMetadata', () => {
  it('extracts correlated native tool lifecycle metadata', () => {
    expect(
      toolExecutionMetadata(
        item({
          transcript_kind: 'tool/call',
          content: JSON.stringify({ execution_id: 'tool_exec_1', phase: 'execute', enforcement: 'native' }),
        })
      )
    ).toEqual({ execution_id: 'tool_exec_1', phase: 'execute', enforcement: 'native' });
  });

  it('ignores ordinary tool output', () => {
    expect(toolExecutionMetadata(item({ transcript_kind: 'tool/call', content: 'file contents' }))).toBeNull();
  });
});
