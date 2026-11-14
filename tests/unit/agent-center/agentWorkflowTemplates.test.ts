import { describe, expect, it } from 'vitest';
import enAgent from '@/renderer/services/i18n/locales/en-US/agent.json';
import zhCnAgent from '@/renderer/services/i18n/locales/zh-CN/agent.json';
import {
  AGENT_WORKFLOW_TEMPLATE_CATEGORIES,
  AGENT_WORKFLOW_TEMPLATE_IDS,
  buildAgentWorkflowTemplates,
} from '@/common/types/agent/agentWorkflowTemplates';

const OFFICE_IDS = ['executiveDeck', 'officeBrief', 'spreadsheetReport'] as const;

/** Resolve `agent.*` keys against a real locale file, failing loudly on a missing key. */
const fromLocale =
  (bundle: Record<string, unknown>) =>
  (key: string): string => {
    const value = key
      .replace(/^agent\./, '')
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
    if (typeof value !== 'string') throw new Error(`missing i18n key ${key}`);
    return value;
  };

describe('Agent workflow templates', () => {
  it('provides every supported enterprise starting point', () => {
    const templates = buildAgentWorkflowTemplates((key) => `translated:${key}`);

    expect(templates.map((template) => template.id)).toEqual(AGENT_WORKFLOW_TEMPLATE_IDS);
    expect(new Set(templates.map((template) => template.id)).size).toBe(templates.length);
  });

  it('keeps the six engineering templates and adds the Office/Deck ones', () => {
    expect(AGENT_WORKFLOW_TEMPLATE_IDS.slice(0, 6)).toEqual([
      'codeReview',
      'defectAnalysis',
      'documentAnalysis',
      'testPlan',
      'weeklyReport',
      'technicalResearch',
    ]);
    expect(AGENT_WORKFLOW_TEMPLATE_IDS).toEqual(expect.arrayContaining([...OFFICE_IDS]));
  });

  it('keeps every template actionable', () => {
    const templates = buildAgentWorkflowTemplates((key) => key);

    expect(templates.every((template) => template.instructions && template.inputPlaceholder)).toBe(true);
    for (const template of templates) {
      expect(template.starters.length).toBe(template.category === 'office' ? 2 : 1);
      expect(new Set(template.starters).size).toBe(template.starters.length);
    }
  });

  it('uses structured output for defect handoff', () => {
    const templates = buildAgentWorkflowTemplates((key) => key);

    expect(templates.find((template) => template.id === 'defectAnalysis')?.outputFormat).toBe('json');
  });

  it('tags Office/Deck templates with their deliverable and a Markdown summary reply', () => {
    const templates = buildAgentWorkflowTemplates((key) => key);
    const byId = Object.fromEntries(templates.map((template) => [template.id, template]));

    expect(byId.executiveDeck).toMatchObject({ category: 'office', deliverable: 'pptx', outputFormat: 'markdown' });
    expect(byId.officeBrief).toMatchObject({ category: 'office', deliverable: 'docx', outputFormat: 'markdown' });
    expect(byId.spreadsheetReport).toMatchObject({ category: 'office', deliverable: 'xlsx', outputFormat: 'markdown' });
    for (const template of templates.filter((x) => x.category === 'engineering')) {
      expect(template.deliverable).toBeUndefined();
    }
    expect(templates.every((template) => AGENT_WORKFLOW_TEMPLATE_CATEGORIES.includes(template.category))).toBe(true);
  });

  it.each([
    ['en-US', enAgent],
    ['zh-CN', zhCnAgent],
  ])('resolves every template string from the %s locale', (_locale, bundle) => {
    const templates = buildAgentWorkflowTemplates(fromLocale(bundle as Record<string, unknown>));
    for (const category of AGENT_WORKFLOW_TEMPLATE_CATEGORIES) {
      expect(
        fromLocale(bundle as Record<string, unknown>)(`agent.agentCenter.templates.categories.${category}`)
      ).toBeTruthy();
    }
    for (const id of OFFICE_IDS) {
      const template = templates.find((x) => x.id === id)!;
      // Office templates must produce a real file via the bundled OfficeCLI, not chat-only Markdown.
      expect(template.instructions).toContain('officecli');
      expect(template.instructions).toContain(`.${template.deliverable}`);
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.inputPlaceholder.length).toBeGreaterThan(0);
    }
  });
});
