import { describe, expect, it } from 'vitest';
import type { ReviewThread } from '@/common/types/agent/taskSession';
import {
  batchThreads,
  canSteer,
  defaultTargetId,
  requestedDelivery,
  routeConversationId,
} from '@/renderer/pages/conversation/Preview/components/annotate/sendModel';

const thread = (over: Partial<ReviewThread>): ReviewThread => ({
  id: 't',
  scope_kind: 'scm',
  scope_id: 'pe:pe1',
  file_path: 'a.ts',
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

describe('send menu model', () => {
  it('reads the conversation id from the hash route only on conversation pages', () => {
    expect(routeConversationId('#/conversation/c-1')).toBe('c-1');
    expect(routeConversationId('#/conversation/c%2F2?tab=x')).toBe('c/2');
    expect(routeConversationId('#/team/t-1')).toBeUndefined();
    expect(routeConversationId('')).toBeUndefined();
  });

  it('defaults to the conversation that made the change, else the open one', () => {
    expect(defaultTargetId({ conversation_id: 'run-conv' }, 'page-conv')).toBe('run-conv');
    expect(defaultTargetId({}, 'page-conv')).toBe('page-conv');
    expect(defaultTargetId({ conversation_id: '' }, undefined)).toBeUndefined();
  });

  it('offers steer only for a running, steer-capable conversation', () => {
    expect(canSteer({ steer: true }, true)).toBe(true);
    expect(canSteer({ steer: true }, false)).toBe(false);
    expect(canSteer({ steer: false }, true)).toBe(false);
    expect(canSteer(undefined, true)).toBe(false);
    expect(requestedDelivery(true)).toBe('steer');
    expect(requestedDelivery(false)).toBe('followup');
  });

  it('sends unresolved threads in Core numbering order', () => {
    const list = [
      thread({ id: 'r', status: 'resolved' }),
      thread({ id: 'b2', file_path: 'b.ts', start_line: 2 }),
      thread({ id: 'a9', file_path: 'a.ts', start_line: 9, status: 'sent' }),
      thread({ id: 'B', file_path: 'B.ts' }),
      thread({ id: 'a3', file_path: 'a.ts', start_line: 3, status: 'outdated' }),
    ];
    expect(batchThreads(list).map((item) => item.id)).toEqual(['B', 'a3', 'a9', 'b2']);
  });
});
