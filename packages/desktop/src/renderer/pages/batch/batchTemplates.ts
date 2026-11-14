/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * E16 Office/Deck — one-click presets for the batch create drawer. A preset
 * only pre-fills the form (title, prompt template, target kind, artifact
 * checks, timeout); targets, assistant, concurrency and trial size stay with
 * the user, and Core still validates the final request like any manual one.
 */

import { newCheckDraft, type BatchForm, type CheckDraft, type TargetPathKind } from './batchModel';

export const BATCH_PRESET_IDS = ['weeklyReportDecks', 'departmentWorkbooks', 'clientBriefs', 'repoReview'] as const;

export type BatchPresetId = (typeof BATCH_PRESET_IDS)[number];

type PresetCheck =
  | { kind: 'file_exists'; path: string }
  | { kind: 'glob'; pattern: string; min?: number; max?: number }
  | { kind: 'json_schema'; path: string; schema: unknown };

export type BatchPreset = {
  id: BatchPresetId;
  pathKind: TargetPathKind;
  /** Relative file the agent must write in each target (named in the prompt). */
  output: string;
  /** Extra values interpolated into the localized prompt. */
  promptValues: Record<string, string>;
  checks: readonly PresetCheck[];
  timeoutMinutes: number;
};

/** `review-findings.json` shape for the repo review preset. */
export const REPO_REVIEW_FINDINGS_SCHEMA = {
  type: 'object',
  required: ['summary', 'findings'],
  properties: {
    summary: { type: 'string', minLength: 1 },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'title'],
        properties: {
          severity: { enum: ['blocker', 'major', 'minor', 'info'] },
          title: { type: 'string', minLength: 1 },
          file: { type: 'string' },
          line: { type: 'integer', minimum: 1 },
          recommendation: { type: 'string' },
        },
      },
    },
  },
} as const;

export const BATCH_PRESETS: Record<BatchPresetId, BatchPreset> = {
  weeklyReportDecks: {
    id: 'weeklyReportDecks',
    pathKind: 'workspace',
    output: 'weekly-report.pptx',
    promptValues: {},
    checks: [{ kind: 'file_exists', path: 'weekly-report.pptx' }],
    timeoutMinutes: 30,
  },
  departmentWorkbooks: {
    id: 'departmentWorkbooks',
    pathKind: 'workspace',
    output: 'department-summary.xlsx',
    promptValues: {},
    checks: [{ kind: 'file_exists', path: 'department-summary.xlsx' }],
    timeoutMinutes: 20,
  },
  clientBriefs: {
    id: 'clientBriefs',
    pathKind: 'workspace',
    output: 'client-brief.docx',
    promptValues: {},
    checks: [{ kind: 'file_exists', path: 'client-brief.docx' }],
    timeoutMinutes: 20,
  },
  repoReview: {
    id: 'repoReview',
    pathKind: 'repo',
    output: 'REVIEW.md',
    promptValues: { findings: 'review-findings.json' },
    checks: [
      { kind: 'file_exists', path: 'REVIEW.md' },
      { kind: 'json_schema', path: 'review-findings.json', schema: REPO_REVIEW_FINDINGS_SCHEMA },
    ],
    timeoutMinutes: 30,
  },
};

const P = 'conversation.batchJobs.presets';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** `{{target.<kind>}}` placeholder the preset prompt uses for the target path. */
export const presetTargetPlaceholder = (preset: BatchPreset): string => `{{target.${preset.pathKind}}}`;

const toDraft = (check: PresetCheck): CheckDraft => {
  const draft = newCheckDraft(check.kind);
  if (check.kind === 'glob') {
    return {
      ...draft,
      pattern: check.pattern,
      min: check.min === undefined ? '' : String(check.min),
      max: check.max === undefined ? '' : String(check.max),
    };
  }
  if (check.kind === 'json_schema') {
    return { ...draft, path: check.path, schema: JSON.stringify(check.schema, null, 2) };
  }
  return { ...draft, path: check.path };
};

/** Localized title + prompt for a preset; placeholders are passed as values so i18n never eats them. */
export const presetTexts = (preset: BatchPreset, t: Translate): { title: string; prompt: string } => ({
  title: t(`${P}.${preset.id}.title`),
  prompt: t(`${P}.${preset.id}.prompt`, {
    target: presetTargetPlaceholder(preset),
    output: preset.output,
    ...preset.promptValues,
  }),
});

/**
 * Apply a preset to the current form. Keeps what the user owns (assistant,
 * targets, concurrency, trial size); replaces title, prompt, target kind,
 * checks and per-item timeout.
 */
export const applyBatchPreset = (form: BatchForm, presetId: BatchPresetId, t: Translate): BatchForm => {
  const preset = BATCH_PRESETS[presetId];
  const { title, prompt } = presetTexts(preset, t);
  return {
    ...form,
    title,
    prompt,
    pathKind: preset.pathKind,
    checks: preset.checks.map(toDraft),
    timeoutMinutes: preset.timeoutMinutes,
  };
};
