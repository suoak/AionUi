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
  plan_artifact_id: string;
  goal_artifact_id?: string;
  approval_id: string;
  status: TaskRunStatus;
  started_at: number;
  finished_at?: number;
  error_message?: string;
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

export type SubmitTaskArtifactResponse = {
  artifact: TaskArtifact;
  approval: TaskApproval;
  acceptance_criteria: AcceptanceCriterion[];
};
