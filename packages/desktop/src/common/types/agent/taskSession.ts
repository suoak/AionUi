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
};

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
