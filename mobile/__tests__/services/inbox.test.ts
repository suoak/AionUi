jest.mock('@/src/services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

import { api } from '@/src/services/api';
import { approvalPolicy } from '@/src/config/approvalPolicy';
import {
  AGENT_SUMMARY_MAX_CHARS,
  apiErrorCode,
  canApproveAgentAction,
  canDenyAgentAction,
  decideTaskApproval,
  getInboxItem,
  invalidationReason,
  isAgentSummaryTruncated,
  listAgentApprovals,
  listInbox,
  loadTaskApproval,
  markAllInboxRead,
  markInboxRead,
  resolveAgentApproval,
  taskApprovalRef,
  type InboxItem,
  type TaskApproval,
} from '@/src/services/inbox';

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const ok = (data: unknown) => ({ data: { success: true, data } });

const planApproval: TaskApproval = {
  id: 'ap1',
  task_session_id: 'ts1',
  approval_type: 'plan',
  artifact_id: 'ar1',
  artifact_hash: 'h1',
  status: 'pending',
  requested_at: 1,
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('default policy (conservative)', () => {
  it('does not auto-execute plans or approve truncated agent summaries', () => {
    expect(approvalPolicy.autoExecutePlanAfterApproval).toBe(false);
    expect(approvalPolicy.allowApproveTruncatedAgentSummary).toBe(false);
  });
});

describe('inbox', () => {
  it('lists items with the default limit', async () => {
    get.mockResolvedValue(ok({ items: [{ id: 'i1' }], unread_count: 3 }));
    await expect(listInbox()).resolves.toEqual({ items: [{ id: 'i1' }], unread_count: 3 });
    expect(get).toHaveBeenCalledWith('/api/inbox', {
      params: { unread_only: undefined, before: undefined, limit: 50 },
    });
  });

  it('tolerates an empty body', async () => {
    get.mockResolvedValue(ok(null));
    await expect(listInbox({ unreadOnly: true })).resolves.toEqual({ items: [], unread_count: 0 });
  });

  it('reads one item by id', async () => {
    get.mockResolvedValue(ok({ id: 'i 1', kind: 'approval', title: 'T', created_at: 1, approval_id: 'ap1' }));
    const item = await getInboxItem('i 1');
    expect(get).toHaveBeenCalledWith('/api/inbox/i%201');
    expect(item.approval_id).toBe('ap1');
  });

  it('throws on a 404 or a malformed body so callers fall back to the list', async () => {
    get.mockRejectedValueOnce({ response: { status: 404 } });
    await expect(getInboxItem('gone')).rejects.toBeTruthy();
    get.mockResolvedValueOnce(ok(null));
    await expect(getInboxItem('x')).rejects.toThrow('Malformed inbox item');
  });

  it('reads the invalidation reason of approval events', () => {
    expect(invalidationReason({ approval_id: 'a', reason: 'superseded' })).toBe('superseded');
    expect(invalidationReason({ approval_id: 'a', reason: 'task_ended' })).toBe('task_ended');
    expect(invalidationReason({ approval_id: 'a', reason: null })).toBeNull();
    expect(invalidationReason({ approval_id: 'a', reason: 'later' })).toBeNull();
    expect(invalidationReason(null)).toBeNull();
  });

  it('marks items read', async () => {
    post.mockResolvedValue(ok({ updated: 1, unread_count: 0 }));
    await markInboxRead('a/b');
    expect(post).toHaveBeenCalledWith('/api/inbox/a%2Fb/read');
    await markAllInboxRead();
    expect(post).toHaveBeenCalledWith('/api/inbox/read-all');
  });

  it('links an item to its task approval', () => {
    const base = {
      id: 'i',
      kind: 'approval',
      source_kind: 's',
      source_id: 's',
      title: 't',
      created_at: 1,
    } as InboxItem;
    expect(taskApprovalRef({ ...base, task_session_id: 'ts1', approval_id: 'ap1' })).toEqual({
      taskSessionId: 'ts1',
      approvalId: 'ap1',
    });
    expect(taskApprovalRef({ ...base, task_session_id: 'ts1' })).toBeNull();
  });
});

describe('task approvals', () => {
  it('loads the approval with its artifact', async () => {
    get.mockImplementation(async (url: string) =>
      url.endsWith('/approvals') ? ok([planApproval]) : ok([{ id: 'other' }, { id: 'ar1', content: '# Plan' }])
    );
    await expect(loadTaskApproval('ts1', 'ap1')).resolves.toEqual({
      approval: planApproval,
      artifact: { id: 'ar1', content: '# Plan' },
    });
    await expect(loadTaskApproval('ts1', 'missing')).resolves.toBeNull();
  });

  it('posts the decision with artifact id and hash', async () => {
    post.mockResolvedValue(ok({ ...planApproval, status: 'rejected' }));
    const result = await decideTaskApproval(planApproval, 'reject', '  no  ');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/task-sessions/ts1/approvals/ap1/decision', {
      decision: 'reject',
      artifact_id: 'ar1',
      artifact_hash: 'h1',
      comment: 'no',
    });
    expect(result.execution).toBe('none');
  });

  it('asks the user to run an approved plan on desktop by default', async () => {
    post.mockResolvedValue(ok({ ...planApproval, status: 'approved' }));
    const result = await decideTaskApproval(planApproval, 'approve', '');
    expect(result).toEqual({ approval: { ...planApproval, status: 'approved' }, execution: 'desktop' });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).not.toHaveProperty('comment');
  });

  it('does not execute goal approvals', async () => {
    post.mockResolvedValue(ok({ ...planApproval, approval_type: 'goal', status: 'approved' }));
    const result = await decideTaskApproval({ ...planApproval, approval_type: 'goal' }, 'approve', undefined, {
      ...approvalPolicy,
      autoExecutePlanAfterApproval: true,
    });
    expect(result.execution).toBe('none');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('executes after approval when the switch is on', async () => {
    post.mockResolvedValueOnce(ok({ ...planApproval, status: 'approved' })).mockResolvedValueOnce(ok({}));
    const result = await decideTaskApproval(planApproval, 'approve', undefined, {
      ...approvalPolicy,
      autoExecutePlanAfterApproval: true,
    });
    expect(result.execution).toBe('started');
    expect(post).toHaveBeenLastCalledWith('/api/task-sessions/ts1/execute', {
      approval_id: 'ap1',
      artifact_id: 'ar1',
      artifact_hash: 'h1',
    });
  });

  it('reports start_failed when Core refuses execute (device scope)', async () => {
    post
      .mockResolvedValueOnce(ok({ ...planApproval, status: 'approved' }))
      .mockRejectedValueOnce({ response: { status: 403, data: { code: 'FORBIDDEN' } } });
    const result = await decideTaskApproval(planApproval, 'approve', undefined, {
      ...approvalPolicy,
      autoExecutePlanAfterApproval: true,
    });
    expect(result.execution).toBe('start_failed');
  });
});

describe('agent approvals', () => {
  const pending = {
    summary: 'POST /api/mcp\n{"name":"x"}',
    status: 'pending',
    expires_at: 2_000,
  };

  it('lists and resolves agent approvals', async () => {
    get.mockResolvedValue(ok([{ id: 'g1' }]));
    await expect(listAgentApprovals()).resolves.toEqual([{ id: 'g1' }]);
    post.mockResolvedValue(ok({ id: 'g1', status: 'approved' }));
    await resolveAgentApproval('g1', true);
    expect(post).toHaveBeenLastCalledWith('/api/agent-approvals/g1/approve');
    await resolveAgentApproval('g1', false);
    expect(post).toHaveBeenLastCalledWith('/api/agent-approvals/g1/deny');
  });

  it('detects truncation from the Core flag', () => {
    expect(isAgentSummaryTruncated({ summary: 'short', summary_truncated: true })).toBe(true);
    expect(isAgentSummaryTruncated({ summary: `${'x'.repeat(4000)}\n…`, summary_truncated: false })).toBe(false);
  });

  it('falls back to the length + suffix heuristic for older Core', () => {
    expect(isAgentSummaryTruncated({ summary: `${'x'.repeat(AGENT_SUMMARY_MAX_CHARS)}\n…` })).toBe(true);
    expect(isAgentSummaryTruncated({ summary: 'short\n…' })).toBe(false);
    expect(isAgentSummaryTruncated({ summary: 'x'.repeat(5000) })).toBe(false);
  });

  it('blocks approving a truncated summary by default but still allows deny', () => {
    const truncated = { ...pending, summary_truncated: true };
    expect(canApproveAgentAction(truncated, approvalPolicy, 1_000)).toBe(false);
    expect(canDenyAgentAction(truncated, 1_000)).toBe(true);
    expect(
      canApproveAgentAction(truncated, { ...approvalPolicy, allowApproveTruncatedAgentSummary: true }, 1_000)
    ).toBe(true);
  });

  it('allows approving a full summary only while pending and not expired', () => {
    expect(canApproveAgentAction(pending, approvalPolicy, 1_000)).toBe(true);
    expect(canApproveAgentAction(pending, approvalPolicy, 2_000)).toBe(false);
    expect(canApproveAgentAction({ ...pending, status: 'denied' }, approvalPolicy, 1_000)).toBe(false);
    expect(canDenyAgentAction({ ...pending, status: 'approved' }, 1_000)).toBe(false);
  });

  it('reads API error codes', () => {
    expect(apiErrorCode({ response: { data: { code: 'APPROVAL_NOT_PENDING' } } })).toBe('APPROVAL_NOT_PENDING');
    expect(apiErrorCode(new Error('x'))).toBeNull();
  });
});
