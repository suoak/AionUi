/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';

const h = vi.hoisted(() => ({
  assistants: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: { list: { invoke: h.assistants } },
    batch: { create: { invoke: h.create } },
  },
}));

// Keys come back verbatim, with interpolation values appended so prompts stay inspectable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && Object.keys(opts).length > 0
        ? `${key}[${Object.entries(opts)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(',')}]`
        : key,
    i18n: { language: 'en-US' },
  }),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

import BatchCreateDrawer from '@/renderer/pages/batch/BatchCreateDrawer';
import { REPO_REVIEW_FINDINGS_SCHEMA } from '@/renderer/pages/batch/batchTemplates';

const field = (testId: string) => {
  const el = screen.getByTestId(testId);
  return (el.matches('input,textarea') ? el : el.querySelector('input,textarea')) as HTMLInputElement;
};
const type = (testId: string, value: string) => fireEvent.change(field(testId), { target: { value } });

const choosePreset = async (labelKey: string) => {
  const select = screen.getByTestId('batch-form-preset-select');
  fireEvent.click(select.querySelector('.arco-select-view') ?? select);
  const options = await screen.findAllByText(labelKey);
  fireEvent.click(options.find((n) => n.closest('.arco-select-option')) ?? options[options.length - 1]);
};

const renderDrawer = () => {
  const onCreated = vi.fn();
  render(<BatchCreateDrawer visible onClose={vi.fn()} onCreated={onCreated} />);
  return onCreated;
};

describe('BatchCreateDrawer presets', () => {
  beforeEach(() => {
    h.assistants.mockReset().mockResolvedValue([{ id: 'asst-1', name: 'Writer', name_i18n: {}, enabled: true }]);
    h.create.mockReset().mockImplementation(async (req: { title: string }) => ({ id: 'job-1', title: req.title }));
    vi.spyOn(Message, 'success').mockImplementation(() => () => undefined);
    vi.spyOn(Message, 'error').mockImplementation(() => () => undefined);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows an optional preset selector with every preset and a neutral hint', async () => {
    renderDrawer();
    await waitFor(() => expect(h.assistants).toHaveBeenCalled());
    expect(screen.getByTestId('batch-form-preset').textContent).toContain('conversation.batchJobs.presets.hint');
    expect(field('batch-form-title').value).toBe('');
    await choosePreset('conversation.batchJobs.presets.weeklyReportDecks.name');
    for (const id of ['departmentWorkbooks', 'clientBriefs', 'repoReview']) {
      expect(screen.getAllByText(`conversation.batchJobs.presets.${id}.name`).length).toBeGreaterThan(0);
    }
  });

  it('fills the form from the weekly deck preset and submits a valid request', async () => {
    const onCreated = renderDrawer();
    await waitFor(() => expect(h.assistants).toHaveBeenCalled());
    await choosePreset('conversation.batchJobs.presets.weeklyReportDecks.name');

    expect(field('batch-form-title').value).toBe('conversation.batchJobs.presets.weeklyReportDecks.title');
    expect(field('batch-form-prompt').value).toBe(
      'conversation.batchJobs.presets.weeklyReportDecks.prompt[target={{target.workspace}},output=weekly-report.pptx]'
    );
    expect(field('batch-form-check-path-0').value).toBe('weekly-report.pptx');
    expect(screen.getByTestId('batch-form-preset').textContent).toContain(
      'conversation.batchJobs.presets.weeklyReportDecks.description'
    );

    type('batch-form-targets', '/data/teams/alpha\n/data/teams/beta');
    fireEvent.click(screen.getByTestId('batch-create-submit'));
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    expect(h.create).toHaveBeenCalledWith({
      title: 'conversation.batchJobs.presets.weeklyReportDecks.title',
      template: {
        prompt:
          'conversation.batchJobs.presets.weeklyReportDecks.prompt[target={{target.workspace}},output=weekly-report.pptx]',
      },
      targets: [{ workspace: '/data/teams/alpha' }, { workspace: '/data/teams/beta' }],
      checks: [{ kind: 'file_exists', path: 'weekly-report.pptx' }],
      assistant_id: 'asst-1',
      mode: 'agent',
      concurrency: 4,
      item_timeout_sec: 1800,
      trial_size: 1,
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('repo review preset adds a JSON schema check and switches targets to repositories', async () => {
    renderDrawer();
    await waitFor(() => expect(h.assistants).toHaveBeenCalled());
    type('batch-form-targets', '/src/service-a');
    await choosePreset('conversation.batchJobs.presets.repoReview.name');

    expect(field('batch-form-targets').value).toBe('/src/service-a');
    expect(field('batch-form-check-path-0').value).toBe('REVIEW.md');
    expect(JSON.parse(field('batch-form-check-schema-1').value)).toEqual(REPO_REVIEW_FINDINGS_SCHEMA);

    fireEvent.click(screen.getByTestId('batch-create-submit'));
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    const req = h.create.mock.calls[0][0];
    expect(req.targets).toEqual([{ repo: '/src/service-a' }]);
    expect(req.checks).toEqual([
      { kind: 'file_exists', path: 'REVIEW.md' },
      { kind: 'json_schema', path: 'review-findings.json', schema: REPO_REVIEW_FINDINGS_SCHEMA },
    ]);
  });

  it('switching presets replaces checks; manual edits after a preset still submit', async () => {
    renderDrawer();
    await waitFor(() => expect(h.assistants).toHaveBeenCalled());
    await choosePreset('conversation.batchJobs.presets.repoReview.name');
    await choosePreset('conversation.batchJobs.presets.clientBriefs.name');
    expect(screen.queryByTestId('batch-form-check-1')).toBeNull();
    expect(field('batch-form-check-path-0').value).toBe('client-brief.docx');

    type('batch-form-title', 'Q4 client briefs');
    type('batch-form-targets', '/clients/acme');
    fireEvent.click(screen.getByTestId('batch-create-submit'));
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    expect(h.create.mock.calls[0][0]).toMatchObject({
      title: 'Q4 client briefs',
      targets: [{ workspace: '/clients/acme' }],
      checks: [{ kind: 'file_exists', path: 'client-brief.docx' }],
      item_timeout_sec: 1200,
    });
  });

  it('manual creation without a preset is unchanged', async () => {
    renderDrawer();
    await waitFor(() => expect(h.assistants).toHaveBeenCalled());
    type('batch-form-title', 'Dependency audit');
    type('batch-form-prompt', 'Audit {{target.repo}} and write report.json');
    type('batch-form-targets', '/r/one');
    type('batch-form-check-path-0', 'report.json');
    fireEvent.click(screen.getByTestId('batch-create-submit'));
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    expect(h.create.mock.calls[0][0]).toMatchObject({
      title: 'Dependency audit',
      targets: [{ repo: '/r/one' }],
      checks: [{ kind: 'file_exists', path: 'report.json' }],
      item_timeout_sec: 1800,
    });
  });
});
