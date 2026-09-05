/**
 * Mirror of aionui-api-types/src/skill_evolution.rs (CSBU WorkMate 技能进化).
 */

export type SkillEvolutionStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'applied' | 'rolled_back';

export type SkillEvolutionAction = 'create' | 'patch';

export interface SkillEvolutionProposal {
  id: string;
  assistant_id?: string;
  conversation_id?: string;
  status: SkillEvolutionStatus;
  title: string;
  experience_summary: string;
  experience_article_ids: string[];
  action: SkillEvolutionAction;
  target_skill_key?: string;
  draft_skill_md: string;
  draft_diff_summary?: string;
  reviewer_user_id?: string;
  review_comment?: string;
  reviewed_at?: number;
  applied_skill_key?: string;
  applied_skill_version?: string;
  created_at: number;
  updated_at: number;
}

export interface CreateSkillEvolutionProposalRequest {
  conversation_id?: string;
  assistant_id?: string;
  title: string;
  experience_summary?: string;
  action?: SkillEvolutionAction;
  target_skill_key?: string;
  draft_skill_md?: string;
  draft_diff_summary?: string;
  auto_stub?: boolean;
  submit?: boolean;
}

export interface ReviewSkillEvolutionRequest {
  comment?: string;
  applied_skill_key?: string;
  applied_skill_version?: string;
}

export interface SkillEvolutionExportPayload {
  skill_key: string;
  skill_md: string;
  suggested_path: string;
}

export interface ApproveSkillEvolutionResponse {
  proposal: SkillEvolutionProposal;
  export: SkillEvolutionExportPayload;
}

export interface EvolveSkillEvolutionRequest {
  assistant_id?: string;
  title?: string;
  target_skill_key?: string;
  action?: SkillEvolutionAction;
  submit?: boolean;
  model?: string;
}

export interface SkillEvolutionTrajectoryOverview {
  turns: number;
  steps: number;
  tools: number;
  errors: number;
  record_count: number;
  digest_md: string;
  conversation_name?: string;
  workspace?: string;
}

export interface EvolveSkillEvolutionResponse {
  proposal: SkillEvolutionProposal;
  experience_articles: ExperienceArticle[];
  trajectory_overview: SkillEvolutionTrajectoryOverview;
  model_used?: string;
}

export interface ApplySkillEvolutionRequest {
  write_to_skills_hub?: boolean;
  pin_on_assistant?: boolean;
  workspace_root?: string;
}

export interface SkillEvolutionSkillRefPayload {
  skill_key: string;
  version_policy: string;
  pinned_version?: string;
  source?: string;
}

export interface ApplySkillEvolutionResponse {
  proposal: SkillEvolutionProposal;
  export: SkillEvolutionExportPayload;
  skills_hub_path?: string;
  workspace_skill_path?: string;
  skill_ref?: SkillEvolutionSkillRefPayload;
}

export interface ExperienceArticle {
  id: string;
  assistant_id?: string;
  kind: string;
  title: string;
  body_md: string;
  source_conversation_ids: string[];
  tags: string[];
  status: string;
  created_at: number;
  updated_at: number;
}
