/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';

const fsMock = vi.hoisted(() => ({
  listPendingSkillReviews: { invoke: vi.fn() },
  getSkillSourceDetail: { invoke: vi.fn() },
  refreshSkillFromSource: { invoke: vi.fn() },
  reviewSkill: { invoke: vi.fn() },
  importSkillsFromSource: { invoke: vi.fn() },
}));
const arco = vi.hoisted(() => ({ confirm: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@/common', () => ({ ipcBridge: { fs: fsMock } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@arco-design/web-react', async (orig) => {
  const actual = await orig<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Modal: { ...actual.Modal, confirm: arco.confirm },
    Message: { ...actual.Message, success: arco.success, error: arco.error, info: arco.info },
  };
});

import SkillReviewQueue from '@/renderer/pages/settings/SkillsSettings/SkillReviewQueue';
import {
  isUntrustedSource,
  skillReviewErrorKey,
  validateImportLocator,
} from '@/renderer/pages/settings/SkillsSettings/skillReviewModel';

const pending = {
  skill_id: 's1',
  name: 'deploy-helper',
  visibility: 'private',
  team_id: null,
  review_status: 'pending',
};
const detail = {
  skill: pending,
  source: {
    kind: 'git',
    locator: 'https://example.com/a.git',
    ref: 'main',
    subpath: null,
    origin_app: null,
    trust: 'untrusted',
    last_fetched_at: 1,
    last_commit: 'abcdef1234567890',
  },
  versions: [
    {
      version_no: 2,
      content_hash: 'h2',
      has_scripts: true,
      source_ref: null,
      created_by: 'u',
      created_at: 2,
      manifest: {},
    },
    {
      version_no: 1,
      content_hash: 'h1',
      has_scripts: false,
      source_ref: null,
      created_by: 'u',
      created_at: 1,
      manifest: {},
    },
  ],
};

const renderQueue = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SkillReviewQueue />
    </SWRConfig>
  );

beforeEach(() => {
  fsMock.listPendingSkillReviews.invoke.mockResolvedValue([pending]);
  fsMock.getSkillSourceDetail.invoke.mockResolvedValue(detail);
  fsMock.reviewSkill.invoke.mockResolvedValue({ ...pending, review_status: 'approved' });
});
afterEach(() => vi.clearAllMocks());

describe('SkillReviewQueue', () => {
  it('shows the empty state and no approve control when nothing is pending', async () => {
    fsMock.listPendingSkillReviews.invoke.mockResolvedValue([]);
    renderQueue();
    expect(await screen.findByText('settings.skillsHub.review.empty')).toBeTruthy();
    expect(screen.queryByText('settings.skillsHub.review.approve')).toBeNull();
  });

  it('shows source, untrusted warning and script versions in the detail', async () => {
    renderQueue();
    fireEvent.click(await screen.findByTestId('skill-review-toggle-s1'));
    expect(await screen.findByTestId('skill-review-untrusted')).toBeTruthy();
    expect(screen.getByTestId('skill-review-version-2').textContent).toContain(
      'settings.skillsHub.review.scriptsBadge'
    );
    expect(screen.getByTestId('skill-review-version-1').textContent).not.toContain('scriptsBadge');
  });

  it('approves only after an explicit confirmation', async () => {
    renderQueue();
    fireEvent.click(await screen.findByTestId('skill-review-approve-s1'));
    await waitFor(() => expect(arco.confirm).toHaveBeenCalledTimes(1));
    expect(fsMock.reviewSkill.invoke).not.toHaveBeenCalled();
    await arco.confirm.mock.calls[0][0].onOk();
    expect(fsMock.reviewSkill.invoke).toHaveBeenCalledWith({ skill_id: 's1', decision: 'approve' });
  });

  it('rejects directly and reports a not-pending conflict', async () => {
    fsMock.reviewSkill.invoke.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/skills/id/s1/review',
        status: 409,
        body: { success: false, code: 'skill_review_not_pending', msg: 'x' },
      })
    );
    renderQueue();
    fireEvent.click(await screen.findByTestId('skill-review-reject-s1'));
    await waitFor(() =>
      expect(arco.error).toHaveBeenCalledWith('settings.skillsHub.review.errors.skill_review_not_pending')
    );
    expect(fsMock.reviewSkill.invoke).toHaveBeenCalledWith({ skill_id: 's1', decision: 'reject' });
  });
});

describe('SkillSourceImportModal', () => {
  it('blocks a non-https address before calling the backend', async () => {
    renderQueue();
    fireEvent.click(await screen.findByTestId('skill-source-import-open'));
    const input = (await screen.findByTestId('skill-source-import-locator')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'http://example.com/repo.git' } });
    fireEvent.click(screen.getByText('settings.skillsHub.review.import.submit'));
    expect((await screen.findByTestId('skill-source-import-error')).textContent).toBe(
      'settings.skillsHub.review.errors.source_url_invalid'
    );
    expect(fsMock.importSkillsFromSource.invoke).not.toHaveBeenCalled();
  });

  it('imports a git source and refreshes the queue', async () => {
    fsMock.importSkillsFromSource.invoke.mockResolvedValue({
      imported: [{ skill: pending, source: detail.source, version: detail.versions[0], changed: true }],
    });
    renderQueue();
    fireEvent.click(await screen.findByTestId('skill-source-import-open'));
    const input = await screen.findByTestId('skill-source-import-locator');
    fireEvent.change(input, { target: { value: ' https://example.com/repo.git ' } });
    fireEvent.click(screen.getByText('settings.skillsHub.review.import.submit'));
    await waitFor(() =>
      expect(fsMock.importSkillsFromSource.invoke).toHaveBeenCalledWith({
        kind: 'git',
        locator: 'https://example.com/repo.git',
      })
    );
    await waitFor(() => expect(fsMock.listPendingSkillReviews.invoke).toHaveBeenCalledTimes(2));
  });
});

describe('skillReviewModel', () => {
  it('validates import locators like the backend', () => {
    expect(validateImportLocator('url', '')).toBe('settings.skillsHub.review.import.locatorRequired');
    expect(validateImportLocator('git', 'file:///etc')).toBe('settings.skillsHub.review.errors.source_url_invalid');
    expect(validateImportLocator('git', 'https://x.dev/a.git')).toBeNull();
    expect(validateImportLocator('local', 'rel/dir')).toBe('settings.skillsHub.review.import.localAbsolute');
    expect(validateImportLocator('local', '/home/u/skills')).toBeNull();
    expect(validateImportLocator('local', 'C:\\skills')).toBeNull();
  });

  it('treats anything not explicitly trusted as untrusted', () => {
    expect(isUntrustedSource(null)).toBe(false);
    expect(isUntrustedSource({ ...detail.source, trust: 'trusted' })).toBe(false);
    expect(isUntrustedSource({ ...detail.source, trust: 'weird' })).toBe(true);
  });
  it('maps 403 and unknown errors', () => {
    const e403 = new BackendHttpError({ method: 'POST', path: '/x', status: 403, body: {} });
    expect(skillReviewErrorKey(e403)).toBe('settings.skillsHub.review.errors.forbidden');
    expect(skillReviewErrorKey(new Error('x'))).toBe('settings.skillsHub.review.errors.generic');
  });
});
