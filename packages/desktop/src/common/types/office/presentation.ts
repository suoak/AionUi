import type { ChatFileRef } from '@/common/types/chatFile';

export type DeckStage = 'outline' | 'ready';
export type DeckBlockType = 'text' | 'list' | 'metric' | 'image' | 'chart' | 'table' | 'timeline' | 'quote' | 'shape';

export type DeckBlock = {
  id: string;
  type: DeckBlockType;
  slot?: string;
  text?: string;
  value?: string;
  label?: string;
  assetId?: string;
  items?: string[];
  data?: unknown;
};

export type DeckSlide = {
  id: string;
  role: string;
  layoutId: string;
  title?: string;
  notes?: string;
  hidden?: boolean;
  blocks: DeckBlock[];
  controls?: Record<string, unknown>;
  /** Preferred alternate layout ids (DeckSpec candidates[]). Studio chips prefer these when present. */
  candidates?: string[];
};

export type DeckAsset = {
  id: string;
  path: string;
  type: 'image';
  status: 'pending' | 'ready' | 'error';
  alt?: string;
  source?: string;
  model?: string;
  promptSummary?: string;
};

export type DeckSpecV1 = {
  schemaVersion: 1;
  revision: number;
  stage: DeckStage;
  metadata: {
    title: string;
    goal?: string;
    audience?: string;
    language: string;
    aspectRatio: '16:9';
    author?: string;
  };
  theme: { id: string; mode?: 'light' | 'dark'; brandTokens?: Record<string, string> };
  slides: DeckSlide[];
  assets: DeckAsset[];
  extensions?: Record<string, unknown>;
};

export type DeckSlot = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  accepts: DeckBlockType[];
  required?: boolean;
  /** Catalog-declared optional slot; Studio exposes slot.<id>.visible toggle. */
  toggleable?: boolean;
  maxLength?: number;
  maxItems?: number;
};

export type DeckLayout = {
  id: string;
  role: string;
  label: string;
  slots: DeckSlot[];
  controls: Array<{
    id: string;
    type: 'toggle' | 'select' | 'range';
    label: string;
    defaultValue: unknown;
    options?: string[];
    min?: number;
    max?: number;
    step?: number;
  }>;
  overflowStrategy?: 'diagnose' | 'shrink' | 'truncate';
  alternativeLayoutIds?: string[];
};

export type DeckTheme = {
  id: string;
  label: string;
  tokens: Record<string, string>;
};

export type PresentationCatalog = {
  version: string;
  hash: string;
  themes: DeckTheme[];
  layouts: DeckLayout[];
};

export type PresentationDiagnostic = {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
  slide_id?: string;
  block_id?: string;
  suggestion?: string;
};

export type PresentationValidation = { valid: boolean; diagnostics: PresentationDiagnostic[] };
export type PresentationRenderStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type PresentationRenderJob = {
  job_id: string;
  revision: number;
  status: PresentationRenderStatus;
  output_file?: string;
  error_code?: string;
};

export type PresentationFileRequest = {
  file_path?: string;
  workspace?: string;
  file?: ChatFileRef;
};

export type PresentationAssetImportRequest = {
  deck: PresentationFileRequest;
  source_file: ChatFileRef;
  asset_id: string;
};

export type PresentationAssetImportResponse = {
  asset_path: string;
  byte_size: number;
};
