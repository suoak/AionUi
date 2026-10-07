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
