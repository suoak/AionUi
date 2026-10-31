/**
 * Inbox and approval REST client for CSBU WorkMate Core (M8 E9-5).
 *
 * Paired phones authenticate with a device token whose scope allows exactly
 * these routes (see Core `aionui-auth/src/device/scope.rs`). The legacy WS
 * bridge is not used: Core drops inbound frames from device sockets.
 */
import { api } from './api';
import { approvalPolicy, type ApprovalPolicy } from '../config/approvalPolicy';

export type InboxKind = 'approval' | 'blocked' | 'completed' | 'failed' | 'question' | 'mention';

export type InboxItem = {
  id: string;
  kind: InboxKind | string;
  source_kind: string;
  source_id: string;
  conversation_id?: string;
  task_session_id?: string;
  run_id?: string;
  title: string;
  summary?: string;
  created_at: number;
  read_at?: number;
  resolved_at?: number;
  origin?: 'batch' | 'autopilot' | string;
  /** Present when the item is a Plan/Goal task approval. */
  approval_id?: string;
};

export type InboxList = { items: InboxItem[]; unread_count: number };
export type InboxReadResult = { updated: number; unread_count: number };

export type TaskApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

export type TaskApproval = {
  id: string;
  task_session_id: string;
  run_id?: string;
  approval_type: 'plan' | 'goal' | string;
  artifact_id: string;
  artifact_hash: string;
  status: TaskApprovalStatus | string;
  requested_at: number;
  resolved_at?: number;
  resolved_by?: string;
  comment?: string;
};

export type TaskArtifact = {
  id: string;
  task_session_id: string;
  kind: string;
  version: number;
  content: string;
  content_hash: string;
  status: string;
  created_at: number;
  updated_at: number;
};

export type AgentApprovalStatus = 'pending' | 'approved' | 'denied' | 'consumed' | 'expired';

export type AgentApproval = {
  id: string;
  user_id?: string;
  conversation_id: string;
  kind: string;
  method: string;
  path: string;
  summary: string;
  /** Added by Core for E9-5; older Core builds omit it. */
  summary_truncated?: boolean;
  status: AgentApprovalStatus | string;
  created_at: number;
  expires_at: number;
};

/** Core's agent-approval summary limit (`SUMMARY_MAX_CHARS`). */
export const AGENT_SUMMARY_MAX_CHARS = 4000;
const TRUNCATION_SUFFIX = '\n…';

function unwrap<T>(body: unknown): T {
  const envelope = body as { success?: boolean; data?: T };
  if (envelope && typeof envelope === 'object' && 'success' in envelope && 'data' in envelope) {
    return envelope.data as T;
  }
  return body as T;
}

const seg = (value: string) => encodeURIComponent(value);

// ---- Inbox ---------------------------------------------------------------

export async function listInbox(params: { unreadOnly?: boolean; before?: number; limit?: number } = {}) {
  const res = await api.get('/api/inbox', {
    params: {
      unread_only: params.unreadOnly || undefined,
      before: params.before,
      limit: params.limit ?? 50,
    },
  });
  const data = unwrap<InboxList>(res.data);
  return { items: Array.isArray(data?.items) ? data.items : [], unread_count: Number(data?.unread_count ?? 0) };
}

export async function markInboxRead(id: string): Promise<InboxReadResult> {
  const res = await api.post(`/api/inbox/${seg(id)}/read`);
  return unwrap<InboxReadResult>(res.data);
}

export async function markAllInboxRead(): Promise<InboxReadResult> {
  const res = await api.post('/api/inbox/read-all');
  return unwrap<InboxReadResult>(res.data);
}

/** The Plan/Goal approval an inbox item points at, if any. */
export function taskApprovalRef(item: InboxItem): { taskSessionId: string; approvalId: string } | null {
  if (item.task_session_id && item.approval_id) {
    return { taskSessionId: item.task_session_id, approvalId: item.approval_id };
  }
  return null;
}

// ---- Plan / Goal approvals ------------------------------------------------

export async function listTaskApprovals(taskSessionId: string): Promise<TaskApproval[]> {
  const res = await api.get(`/api/task-sessions/${seg(taskSessionId)}/approvals`);
  const data = unwrap<TaskApproval[]>(res.data);
  return Array.isArray(data) ? data : [];
}

export async function listTaskArtifacts(taskSessionId: string): Promise<TaskArtifact[]> {
  const res = await api.get(`/api/task-sessions/${seg(taskSessionId)}/artifacts`);
  const data = unwrap<TaskArtifact[]>(res.data);
  return Array.isArray(data) ? data : [];
}

export type TaskApprovalDetail = { approval: TaskApproval; artifact: TaskArtifact | null };

export async function loadTaskApproval(taskSessionId: string, approvalId: string): Promise<TaskApprovalDetail | null> {
  const [approvals, artifacts] = await Promise.all([
    listTaskApprovals(taskSessionId),
    listTaskArtifacts(taskSessionId),
  ]);
  const approval = approvals.find((a) => a.id === approvalId);
  if (!approval) return null;
  return { approval, artifact: artifacts.find((a) => a.id === approval.artifact_id) ?? null };
}

/**
 * - `none`: nothing to execute (rejected, or a Goal approval).
 * - `desktop`: Plan approved; the user starts execution on the desktop.
 * - `started`: Plan approved and execution started from the phone.
 * - `start_failed`: auto-execute was enabled but Core refused it.
 */
export type PlanExecution = 'none' | 'desktop' | 'started' | 'start_failed';

export type TaskDecisionResult = { approval: TaskApproval; execution: PlanExecution };

export async function decideTaskApproval(
  approval: Pick<TaskApproval, 'id' | 'task_session_id' | 'artifact_id' | 'artifact_hash' | 'approval_type'>,
  decision: 'approve' | 'reject',
  comment?: string,
  policy: ApprovalPolicy = approvalPolicy
): Promise<TaskDecisionResult> {
  const trimmed = comment?.trim();
  const res = await api.post(
    `/api/task-sessions/${seg(approval.task_session_id)}/approvals/${seg(approval.id)}/decision`,
    {
      decision,
      artifact_id: approval.artifact_id,
      artifact_hash: approval.artifact_hash,
      ...(trimmed ? { comment: trimmed } : {}),
    }
  );
  const updated = unwrap<TaskApproval>(res.data);

  if (decision !== 'approve' || approval.approval_type !== 'plan') {
    return { approval: updated, execution: 'none' };
  }
  if (!policy.autoExecutePlanAfterApproval) {
    return { approval: updated, execution: 'desktop' };
  }
  try {
    await api.post(`/api/task-sessions/${seg(approval.task_session_id)}/execute`, {
      approval_id: approval.id,
      artifact_id: approval.artifact_id,
      artifact_hash: approval.artifact_hash,
    });
    return { approval: updated, execution: 'started' };
  } catch {
    return { approval: updated, execution: 'start_failed' };
  }
}

// ---- Agent action approvals ------------------------------------------------

export async function listAgentApprovals(): Promise<AgentApproval[]> {
  const res = await api.get('/api/agent-approvals');
  const data = unwrap<AgentApproval[]>(res.data);
  return Array.isArray(data) ? data : [];
}

export async function getAgentApproval(id: string): Promise<AgentApproval> {
  const res = await api.get(`/api/agent-approvals/${seg(id)}`);
  return unwrap<AgentApproval>(res.data);
}

export async function resolveAgentApproval(id: string, approve: boolean): Promise<AgentApproval> {
  const res = await api.post(`/api/agent-approvals/${seg(id)}/${approve ? 'approve' : 'deny'}`);
  return unwrap<AgentApproval>(res.data);
}

/**
 * Whether the card is not showing the whole request. Uses Core's
 * `summary_truncated` flag; older Core builds without the flag are detected
 * by the length + "\n…" suffix Core appends when it truncates.
 */
export function isAgentSummaryTruncated(record: Pick<AgentApproval, 'summary' | 'summary_truncated'>): boolean {
  if (typeof record.summary_truncated === 'boolean') return record.summary_truncated;
  const summary = record.summary ?? '';
  return summary.endsWith(TRUNCATION_SUFFIX) && Array.from(summary).length >= AGENT_SUMMARY_MAX_CHARS;
}

export function canApproveAgentAction(
  record: Pick<AgentApproval, 'summary' | 'summary_truncated' | 'status' | 'expires_at'>,
  policy: ApprovalPolicy = approvalPolicy,
  now = Date.now()
): boolean {
  if (record.status !== 'pending' || record.expires_at <= now) return false;
  return policy.allowApproveTruncatedAgentSummary || !isAgentSummaryTruncated(record);
}

export function canDenyAgentAction(record: Pick<AgentApproval, 'status' | 'expires_at'>, now = Date.now()): boolean {
  return record.status === 'pending' && record.expires_at > now;
}

/** Error code helper for `{success:false, code}` responses (e.g. APPROVAL_NOT_PENDING). */
export function apiErrorCode(error: unknown): string | null {
  const data = (error as { response?: { data?: { code?: unknown } } })?.response?.data;
  return typeof data?.code === 'string' ? data.code : null;
}
