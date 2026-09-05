/**
 * Mirror of aionui-api-types/src/skill_evolution.rs (CSBU WorkMate 技能进化).
 */

export type SkillEvolutionStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'rolled_back';

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
