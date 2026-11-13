/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import enConversation from '@/renderer/services/i18n/locales/en-US/conversation.json';
import zhCnConversation from '@/renderer/services/i18n/locales/zh-CN/conversation.json';
import { buildCheck, buildCreateRequest, defaultBatchForm, templateFields } from '@/renderer/pages/batch/batchModel';
import {
  BATCH_PRESETS,
  BATCH_PRESET_IDS,
  REPO_REVIEW_FINDINGS_SCHEMA,
  applyBatchPreset,
  presetTargetPlaceholder,
} from '@/renderer/pages/batch/batchTemplates';

/** Minimal i18next stand-in: resolves `conversation.*` from a real locale and interpolates `{{var}}` once. */
const localeT =
  (bundle: Record<string, unknown>) =>
  (key: string, options: Record<string, unknown> = {}): string => {
    const value = key
      .replace(/^conversation\./, '')
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
    if (typeof value !== 'string') throw new Error(`missing i18n key ${key}`);
    return value.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, name: string) =>
      name in options ? String(options[name]) : match
    );
  };

const enT = localeT(enConversation as Record<string, unknown>);

const TARGETS = {
  workspace: ['/data/teams/alpha', '/data/teams/beta', 'D:\\teams\\gamma'],
  repo: ['/src/service-a', '/src/service-b'],
};

const filled = (presetId: (typeof BATCH_PRESET_IDS)[number], t = enT) => {
  const base = { ...defaultBatchForm(), assistantId: 'asst-1', concurrency: 2, trialSize: 1 };
  const form = applyBatchPreset(base, presetId, t);
  return { ...form, targetsText: TARGETS[form.pathKind].join('\n') };
};

describe('batch presets (E16 Office/Deck)', () => {
  it('ships the Office/Deck presets plus a repo review', () => {
    expect(BATCH_PRESET_IDS).toEqual(['weeklyReportDecks', 'departmentWorkbooks', 'clientBriefs', 'repoReview']);
    expect(BATCH_PRESETS.weeklyReportDecks.output).toBe('weekly-report.pptx');
    expect(BATCH_PRESETS.departmentWorkbooks.output).toBe('department-summary.xlsx');
    expect(BATCH_PRESETS.clientBriefs.output).toBe('client-brief.docx');
    expect(BATCH_PRESETS.repoReview.pathKind).toBe('repo');
  });

  it.each(BATCH_PRESET_IDS)('%s produces a valid Core create request', (presetId) => {
    const form = filled(presetId);
    const { request, issues } = buildCreateRequest(form);
    expect(issues).toEqual([]);
    expect(request).not.toBeNull();
    const preset = BATCH_PRESETS[presetId];
    expect(request).toMatchObject({
      assistant_id: 'asst-1',
      mode: 'agent',
      concurrency: 2,
      trial_size: 1,
      item_timeout_sec: preset.timeoutMinutes * 60,
    });
    expect(request!.targets).toEqual(TARGETS[preset.pathKind].map((path) => ({ [preset.pathKind]: path })));
    expect(request!.checks).toEqual(preset.checks);
    expect(request!.title).toBe(enT(`conversation.batchJobs.presets.${presetId}.title`));
  });

  it.each(BATCH_PRESET_IDS)('%s prompt references the target and names its artifact', (presetId) => {
    const preset = BATCH_PRESETS[presetId];
    for (const t of [enT, localeT(zhCnConversation as Record<string, unknown>)]) {
      const { prompt } = applyBatchPreset(defaultBatchForm(), presetId, t);
      expect(prompt).toContain(presetTargetPlaceholder(preset));
      expect(prompt).toContain(preset.output);
      for (const value of Object.values(preset.promptValues)) expect(prompt).toContain(value);
      // Only the target path field is referenced, so plain path-per-line targets always validate.
      expect(templateFields(prompt)).toEqual([preset.pathKind]);
      expect(prompt).not.toMatch(/\{\{\s*(output|target|findings)\s*\}\}/);
    }
  });

  it('every preset check is a valid, safe relative check', () => {
    for (const presetId of BATCH_PRESET_IDS) {
      const form = applyBatchPreset(defaultBatchForm(), presetId, enT);
      for (const draft of form.checks) expect(buildCheck(draft).issue).toBeNull();
      const paths = BATCH_PRESETS[presetId].checks.map((c) => ('path' in c ? c.path : c.pattern));
      expect(paths).toContain(BATCH_PRESETS[presetId].output);
    }
  });

  it('repo review validates review-findings.json against a schema', () => {
    const json = BATCH_PRESETS.repoReview.checks.find((c) => c.kind === 'json_schema');
    expect(json).toEqual({ kind: 'json_schema', path: 'review-findings.json', schema: REPO_REVIEW_FINDINGS_SCHEMA });
    const draft = applyBatchPreset(defaultBatchForm(), 'repoReview', enT).checks[1];
    expect(JSON.parse(draft.schema)).toEqual(REPO_REVIEW_FINDINGS_SCHEMA);
  });

  it('keeps the user-owned fields and replaces only preset-owned ones', () => {
    const base = {
      ...defaultBatchForm(),
      title: 'old',
      assistantId: 'asst-9',
      targetsText: '/x\n/y',
      concurrency: 7,
      trialSize: 2,
    };
    const next = applyBatchPreset(base, 'clientBriefs', enT);
    expect(next).toMatchObject({ assistantId: 'asst-9', targetsText: '/x\n/y', concurrency: 7, trialSize: 2 });
    expect(next.title).toBe('Client briefs');
    expect(next.pathKind).toBe('workspace');
    expect(next.timeoutMinutes).toBe(20);
    expect(next.checks.map((c) => c.path)).toEqual(['client-brief.docx']);
    // Fresh draft keys so React lists never collide with the previous checks.
    expect(next.checks[0].key).not.toBe(base.checks[0].key);
  });
});
