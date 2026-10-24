export const TASK_SESSION_MODES = ['agent', 'plan', 'goal'] as const;
export type TaskSessionMode = (typeof TASK_SESSION_MODES)[number];

export const TASK_SESSION_STATUSES = [
  'draft',
  'ready',
  'running',
  'waiting_approval',
  'paused',
  'completed',
  'failed',
  'cancelled',
] as const;
export type TaskSessionStatus = (typeof TASK_SESSION_STATUSES)[number];

/** Board (workflow) column of a task session, separate from its run `status` (M8 E6). */
export const TASK_BOARD_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'] as const;
export type TaskBoardStatus = (typeof TASK_BOARD_STATUSES)[number];

// ---- Work-item board HTTP API (aioncore ≥ M8 E6-3; mirrors aionui-api-types task_board.rs) ----

export type TaskAssigneeKind = 'user' | 'agent' | 'squad';
export type TaskAssignee = { kind: TaskAssigneeKind; id: string };

/** One card of `GET /api/task-sessions/board`. `status` is the run state (badge only). */
export type TaskBoardItem = {
  id: string;
  title: string;
  project_id: string | null;
  conversation_id: string | null;
  mode: TaskSessionMode;
  status: TaskSessionStatus;
  board_status: TaskBoardStatus;
  assignee: TaskAssignee | null;
  /** 0 none, 1 low, 2 medium, 3 high, 4 urgent. */
  priority: number;
  labels: string[];
  /** Lexicographic order inside a column; `null` sorts last. */
  board_rank: string | null;
  external_ref: string | null;
  created_at: number;
  updated_at: number;
};

/** `GET /api/task-sessions/board`: always all six columns, in display order. */
export type TaskBoardResponse = {
  columns: { board_status: TaskBoardStatus; items: TaskBoardItem[] }[];
};

export type TaskBoardQuery = {
  project_id?: string;
  assignee_kind?: TaskAssigneeKind;
  assignee_id?: string;
  label?: string;
};

/**
 * `PATCH /api/task-sessions/{id}/board`. Absent fields stay unchanged; `null`
 * clears `board_rank` / `assignee`. `done` is only reachable through review.
 */
export type UpdateTaskBoardInput = {
  board_status?: Exclude<TaskBoardStatus, 'done'>;
  board_rank?: string | null;
  assignee?: TaskAssignee | null;
  priority?: number;
  labels?: string[];
};

export type TaskCommentKind = 'comment' | 'status_change' | 'assignment' | 'review_decision';

/**
 * Timeline entry. `body` is plain text for `comment`; a JSON object for the
 * event kinds: `status_change` {from,to}, `assignment` {assignee},
 * `review_decision` {decision,comment}.
 */
export type TaskComment = {
  id: string;
  task_session_id: string;
  author_kind: 'user' | 'agent' | 'system';
  author_id: string;
  kind: TaskCommentKind;
  body: string;
  created_at: number;
  edited_at: number | null;
};

export type TaskBoardReviewDecision = 'approve' | 'reject';
/** `reject` requires a non-empty comment and sends the item back to `todo`. */
export type TaskBoardReviewInput = { decision: TaskBoardReviewDecision; comment?: string };
export type TaskBoardReviewResult = { item: TaskBoardItem; decision: TaskComment };

/** `details.reason` of a 409 `board_transition_rejected`. */
export type TaskBoardRejectionReason =
  | 'review_required'
  | 'backlog_not_started'
  | 'plan_not_approved'
  | 'agent_review_gate'
  | 'not_in_review'
  | 'not_allowed';

export type PlanningIsolationLevel = 'guaranteed' | 'best_effort' | 'unsupported';
export type AgentIntegrationMode =
  | 'native_sandbox'
  | 'native_permission_mode'
  | 'generic_acp'
  | 'in_process_tool_registry'
  | 'unknown';

export type PlanningIsolation = {
  level: PlanningIsolationLevel;
  integration_mode: AgentIntegrationMode;
  automatic_planning_enabled: boolean;
  reason: string;
  evidence: string[];
};

export const canStartAutomaticPlanning = (isolation?: PlanningIsolation): boolean =>
  isolation?.level === 'guaranteed' && isolation.automatic_planning_enabled;

export type RuntimeBindingState =
  | 'bound'
  | 'not_resumable'
  | 'resume_failed'
  | 'revalidation_required'
  | 'unavailable'
  | 'broken';

export type RuntimeBinding = {
  runtime_type: string;
  integration_mode: string;
  runtime_session_id: string;
  state: RuntimeBindingState;
  workspace_path?: string;
  runtime_version?: string;
  account_generation?: number;
  last_observed_at?: number;
};

export type TaskSession = {
  id: string;
  title: string;
  project_id?: string;
  conversation_id?: string;
  mode: TaskSessionMode;
  objective: string;
  acceptance_criteria: string[];
  status: TaskSessionStatus;
  agent_type: string;
  agent_session_id?: string;
  runtime_binding?: RuntimeBinding;
  created_at: number;
  updated_at: number;
  /** Execution attempts per approval, 1 = no retry (aioncore ≥ M7 E5-5; absent on older cores). */
  retry_max_attempts?: number;
  /** Per-attempt execution timeout in ms (aioncore ≥ M7 E5-5). */
  retry_timeout_ms?: number;
  /** Board column (aioncore ≥ M8 E6-2, migration 072; absent on older cores). */
  board_status?: TaskBoardStatus;
};

/** `PUT /api/task-sessions/{id}/retry-policy` body (aioncore ≥ M7 E5-5). */
export type TaskRetryPolicyInput = {
  max_attempts: number;
  timeout_ms: number | null;
};

export const TASK_RETRY_MAX_ATTEMPTS = 3;
export const TASK_RUN_TIMEOUT_MIN_MS = 1_000;
export const TASK_RUN_TIMEOUT_MAX_MS = 86_400_000;

export type CreateTaskSessionInput = Pick<TaskSession, 'title' | 'mode' | 'objective' | 'agent_type'> & {
  project_id?: string;
  conversation_id?: string;
  acceptance_criteria?: string[];
  status?: Extract<TaskSessionStatus, 'draft' | 'ready'>;
  agent_session_id?: string;
};

export type UpdateTaskSessionInput = Partial<
  Pick<
    TaskSession,
    | 'title'
    | 'project_id'
    | 'conversation_id'
    | 'mode'
    | 'objective'
    | 'acceptance_criteria'
    | 'status'
    | 'agent_type'
    | 'agent_session_id'
  >
>;

export type TaskArtifactKind = 'plan' | 'goal';
export type TaskArtifactStatus = 'submitted' | 'approved' | 'rejected' | 'superseded';
export type TaskApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
export type TaskRunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type AcceptanceCriterionStatus = 'pending' | 'passed' | 'failed' | 'needs_verification';
export type AcceptanceEvidenceKind = 'test_result' | 'command_result' | 'file_diff' | 'artifact' | 'user_confirmation';

export type TaskArtifact = {
  id: string;
  task_session_id: string;
  kind: TaskArtifactKind;
  version: number;
  content: string;
  content_hash: string;
  status: TaskArtifactStatus;
  created_at: number;
  updated_at: number;
};

export type TaskApproval = {
  id: string;
  task_session_id: string;
  run_id?: string;
  approval_type: TaskArtifactKind;
  artifact_id: string;
  artifact_hash: string;
  status: TaskApprovalStatus;
  requested_at: number;
  resolved_at?: number;
  resolved_by?: string;
  comment?: string;
};

export type TaskRun = {
  id: string;
  task_session_id: string;
  conversation_id: string;
  run_kind: 'planning' | 'execution';
  plan_artifact_id?: string;
  goal_artifact_id?: string;
  approval_id?: string;
  status: TaskRunStatus;
  started_at: number;
  finished_at?: number;
  error_message?: string;
  agent_id?: string;
  agent_runtime?: string;
  model?: string;
  mode?: TaskSessionMode;
  planning_isolation?: PlanningIsolationLevel;
  result_summary?: string;
  usage?: Record<string, unknown>;
  /** 1-based attempt in a retry chain (aioncore ≥ M7 E5-5). */
  attempt?: number;
  /** The failed run this run retries (aioncore ≥ M7 E5-5). */
  retry_of_run_id?: string;
  timeout_ms?: number;
};

export type TaskTraceEvent = {
  event_id: string;
  task_id: string;
  run_id: string;
  sequence: number;
  timestamp: number;
  event_type: string;
  payload: Record<string, unknown>;
};

export type TaskCheckpoint = {
  id: string;
  task_id: string;
  run_id: string;
  checkpoint_type: string;
  sequence: number;
  artifact_id?: string;
  state: Record<string, unknown>;
  created_at: number;
};

export type TaskEvidence = {
  id: string;
  task_id: string;
  run_id: string;
  trace_event_id?: string;
  criterion_id?: string;
  kind: string;
  summary: string;
  reference?: string;
  metadata: Record<string, unknown>;
  created_at: number;
};

export type TaskReview = {
  task: TaskSession;
  run: TaskRun;
  artifacts: TaskArtifact[];
  approvals: TaskApproval[];
  acceptance_criteria: AcceptanceCriterion[];
  trace: TaskTraceEvent[];
  checkpoints: TaskCheckpoint[];
  evidence: TaskEvidence[];
  summary: {
    status: TaskRunStatus;
    files_changed: number;
    tool_calls: number;
    policy_decisions: number;
    denied_decisions: number;
    criteria_passed: number;
    criteria_total: number;
  };
};

export type AcceptanceEvidence = {
  kind: AcceptanceEvidenceKind;
  summary: string;
  reference?: string;
};

export type AcceptanceCriterion = {
  id: string;
  task_session_id: string;
  goal_artifact_id: string;
  position: number;
  description: string;
  status: AcceptanceCriterionStatus;
  evidence: AcceptanceEvidence[];
  verified_at?: number;
};

export type SubmitTaskArtifactInput = {
  kind: TaskArtifactKind;
  content: string;
  acceptance_criteria?: string[];
};

export type StartAutomaticPlanningInput = {
  prompt: string;
};

export type SubmitTaskArtifactResponse = {
  artifact: TaskArtifact;
  approval: TaskApproval;
  acceptance_criteria: AcceptanceCriterion[];
};

// ── Diff annotations / review threads (M7 E4, Core `/api/review-threads*`) ──

/** What a review thread's `scope_id` identifies. `scm` ids are `pe:{pe_id}[/{rel}]`. */
export type ReviewScopeKind = 'scm' | 'worktree' | 'task_run';
export type ReviewSide = 'new' | 'old';
export type ReviewThreadStatus = 'open' | 'sent' | 'resolved' | 'outdated';

/** The selected diff lines as rendered; Core re-derives the anchor when it can read the file. */
export type ReviewDiffContext = {
  hunk_header?: string;
  /** `WORKTREE`, `INDEX` or a commit; Core defaults the new side to `WORKTREE`. */
  base?: string;
  before: string[];
  lines: string[];
  after: string[];
};

export type ReviewAnchor = {
  v: number;
  base?: string;
  content_sha?: string;
  hunk_header?: string;
  before: string[];
  lines: string[];
  after: string[];
  moved_fuzzy?: boolean;
  original_lines?: string[];
};

export type ReviewComment = {
  id: string;
  thread_id: string;
  author: 'user' | 'agent';
  body: string;
  created_at: number;
  updated_at: number;
};

export type ReviewThread = {
  id: string;
  scope_kind: ReviewScopeKind;
  scope_id: string;
  conversation_id?: string | null;
  task_session_id?: string | null;
  run_id?: string | null;
  file_path: string;
  side: ReviewSide;
  start_line: number;
  end_line: number;
  status: ReviewThreadStatus;
  moved_fuzzy: boolean;
  anchor: ReviewAnchor;
  last_batch_id?: string | null;
  comments: ReviewComment[];
  created_at: number;
  updated_at: number;
  resolved_at?: number | null;
};

export type ListReviewThreadsInput = {
  scope_kind: ReviewScopeKind;
  scope_id: string;
  file_path?: string;
  status?: ReviewThreadStatus;
};

export type CreateReviewThreadInput = {
  scope_kind: ReviewScopeKind;
  scope_id: string;
  conversation_id?: string;
  task_session_id?: string;
  run_id?: string;
  file_path: string;
  side: ReviewSide;
  start_line: number;
  end_line: number;
  body: string;
  diff_context: ReviewDiffContext;
};

export type UpdateReviewThreadInput = {
  id: string;
  body?: string;
  start_line?: number;
  end_line?: number;
  diff_context?: ReviewDiffContext;
};

/** `auto` steers into a running turn, else followup (Core decides). */
export type ReviewDelivery = 'auto' | 'steer' | 'followup';

/** `POST /api/review-batches`. Empty `thread_ids` = every unresolved thread of the scope. */
export type SendReviewBatchInput = {
  target_conversation_id: string;
  delivery?: ReviewDelivery;
  thread_ids?: string[];
  scope_kind?: ReviewScopeKind;
  scope_id?: string;
  /** Replaces the block's default instruction line. */
  preface?: string;
};

export type ReviewBatch = {
  id: string;
  target_conversation_id: string;
  /** The mode actually used (`steer` falls back to `followup` when idle). */
  delivery: 'steer' | 'followup';
  thread_ids: string[];
  /** The frozen `[[AION_REVIEW]]` text that was sent. */
  content: string;
  input_id: string | null;
  status: 'sending' | 'accepted' | 'failed';
  error_message: string | null;
  created_at: number;
};

export type SendReviewBatchResult = {
  batch: ReviewBatch;
  /** The conversation input receipt, passed through from Core. */
  input_receipt: unknown;
};

// ── PR / MR delivery (M7 E4-5, Core `/api/scm-deliveries*`) ──

export type ScmHostProvider = 'github' | 'gitlab' | 'other';

/** Remote host + CLI readiness for one repository (`GET /api/scm-deliveries/host`). */
export type ScmHostStatus = {
  provider: ScmHostProvider;
  host?: string | null;
  remote?: string | null;
  remote_url_redacted?: string | null;
  /** `gh` / `glab`; absent for an unsupported host. */
  cli?: 'gh' | 'glab' | null;
  installed: boolean;
  authenticated: boolean;
  detail?: string | null;
};

export type ScmDelivery = {
  id: string;
  repo_path: string;
  branch: string;
  commit_sha?: string | null;
  remote?: string | null;
  provider?: string | null;
  pr_url?: string | null;
  pr_number?: string | null;
  worktree_id?: string | null;
  task_session_id?: string | null;
  run_id?: string | null;
  created_at: number;
};

export type CreatePullRequestInput = {
  /** `pe:{pe_id}[/{rel}]` (or an allowed absolute path); Core sandboxes it. */
  repo_path: string;
  branch: string;
  base: string;
  title: string;
  body?: string;
  draft?: boolean;
  remote?: string;
  /** Both or neither: the PR link is recorded as evidence of this run. */
  task_session_id?: string;
  run_id?: string;
};

export type CreatePullRequestResult = {
  pr_url: string;
  pr_number?: string | null;
  provider: ScmHostProvider;
  delivery: ScmDelivery;
  evidence_id?: string | null;
};

/** One page of `GET /api/task-sessions/{id}/runs/{run_id}/replay` (M7 E5-2). */
export type TaskRunReplayPage = {
  run: TaskRun;
  events: TaskTraceEvent[];
  /** Cursor for the next page; equals the request cursor when nothing new. */
  next_after_sequence: number;
  has_more: boolean;
  latest_sequence: number;
  /** Sequences in the requested window are missing (pruned by retention). */
  retention_gap: boolean;
  /** First page only. */
  approvals?: TaskApproval[];
  /** First page only. */
  evidence?: TaskEvidence[];
};
