/**
 * M9 E15 local-kb wire types (CSBU WorkMate).
 * Default OFF. Not KnowHub. Not skill experience library.
 */

export interface LocalKbSettings {
  enabled: boolean;
  updated_at: number;
}

export interface UpdateLocalKbSettingsRequest {
  enabled: boolean;
}

export interface LocalKbSource {
  id: string;
  kind: string;
  label: string;
  origin_path?: string;
  document_count: number;
  created_at: number;
  updated_at: number;
}

export interface CreateLocalKbSourceRequest {
  kind: string;
  label: string;
  origin_path?: string;
  text?: string;
  title?: string;
}

export interface LocalKbSearchHit {
  document_id: string;
  source_id: string;
  title: string;
  snippet: string;
  content_hash: string;
  provider: string;
}

export interface LocalKbSearchRequest {
  query: string;
  limit?: number;
  task_id?: string;
}
