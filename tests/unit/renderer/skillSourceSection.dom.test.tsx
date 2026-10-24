/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';

const fsMock = vi.hoisted(() => ({
  getSkillSourceDetail: { invoke: vi.fn() },
  refreshSkillFromSource: { invoke: vi.fn() },
}));
const arco = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({ ipcBridge: { fs: fsMock } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@arco-design/web-react', async (orig) => {
  const actual = await orig<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: { ...actual.Message, error: arco.error, info: arco.info, warning: arco.warning },
  };
});

import SkillSourceSection from '@/renderer/pages/settings/SkillsSettings/SkillSourceSection';

const skill = {
  skill_id: 's1',
  name: 'deploy-helper',
  visibility: 'private',
  team_id: null,
  review_status: 'approved',
};
const source = (kind: string) => ({
  kind,
  locator: 'https://example.com/a.git',
  ref: 'main',
  subpath: null,
  origin_app: null,
  trust: 'trusted',
  last_fetched_at: 1,
  last_commit: 'abcdef1234567890',
});
const version = {
  version_no: 1,
  content_hash: 'h1',
  has_scripts: false,
  source_ref: null,
  created_by: 'import',
  created_at: 1,
  manifest: {},
};
const detail = (kind: string | null) => ({ skill, source: kind ? source(kind) : null, versions: [version] });

const renderSection = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SkillSourceSection skillId='s1' />
    </SWRConfig>
  );

describe('SkillSourceSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when Core has no source API (404)', async () => {
    fsMock.getSkillSourceDetail.invoke.mockRejectedValue(
      new BackendHttpError({ method: 'GET', path: '/x', status: 404, body: { success: false, error: 'Not found' } })
    );
    const { container } = renderSection();
    await waitFor(() => expect(fsMock.getSkillSourceDetail.invoke).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-testid="skill-detail-source"]')).toBeNull();
  });

  it('shows source and versions with a check-update button for git sources', async () => {
    fsMock.getSkillSourceDetail.invoke.mockResolvedValue(detail('git'));
    renderSection();
    expect(await screen.findByTestId('skill-detail-source-check-update')).toBeTruthy();
    expect(await screen.findByTestId('skill-review-version-1')).toBeTruthy();
    expect(screen.getByText(/https:\/\/example.com\/a.git/)).toBeTruthy();
  });

  it('hides check-update for registry sources and skills without a source', async () => {
    fsMock.getSkillSourceDetail.invoke.mockResolvedValue(detail('registry'));
    const first = renderSection();
    await screen.findByTestId('skill-detail-source');
    expect(screen.queryByTestId('skill-detail-source-check-update')).toBeNull();
    first.unmount();

    fsMock.getSkillSourceDetail.invoke.mockResolvedValue(detail(null));
    renderSection();
    await screen.findByText('settings.skillsHub.review.sourceNone', { exact: false });
    expect(screen.queryByTestId('skill-detail-source-check-update')).toBeNull();
  });

  it('reports no change', async () => {
    fsMock.getSkillSourceDetail.invoke.mockResolvedValue(detail('url'));
    fsMock.refreshSkillFromSource.invoke.mockResolvedValue({ skill, source: source('url'), version, changed: false });
    renderSection();
    fireEvent.click(await screen.findByTestId('skill-detail-source-check-update'));
    await waitFor(() => expect(arco.info).toHaveBeenCalledWith('settings.skillsHub.review.refreshNoChange'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('reports an applied update when the skill stays approved', async () => {
    fsMock.getSkillSourceDetail.invoke.mockResolvedValue(detail('git'));
    fsMock.refreshSkillFromSource.invoke.mockResolvedValue({ skill, source: source('git'), version, changed: true });
    renderSection();
    fireEvent.click(await screen.findByTestId('skill-detail-source-check-update'));
    await waitFor(() => expect(arco.info).toHaveBeenCalledWith('settings.skillsHub.sourceSection.updated'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('sends the user to the review queue when the update needs review', async () => {
    fsMock.getSkillSourceDetail.invoke.mockResolvedValue(detail('git'));
    fsMock.refreshSkillFromSource.invoke.mockResolvedValue({
      skill: { ...skill, review_status: 'pending' },
      source: source('git'),
      version: { ...version, version_no: 2, has_scripts: true },
      changed: true,
    });
    renderSection();
    fireEvent.click(await screen.findByTestId('skill-detail-source-check-update'));
    await waitFor(() => expect(arco.warning).toHaveBeenCalledWith('settings.skillsHub.sourceSection.movedToReview'));
    expect(navigate).toHaveBeenCalledWith('/settings/skills', { state: { skillsTab: 'review' } });
    expect(arco.info).not.toHaveBeenCalled();
  });

  it('maps refresh errors by message prefix', async () => {
    fsMock.getSkillSourceDetail.invoke.mockResolvedValue(detail('git'));
    fsMock.refreshSkillFromSource.invoke.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/x',
        status: 409,
        body: { success: false, code: 'CONFLICT', error: 'skill_source_renamed: upstream name changed' },
      })
    );
    renderSection();
    fireEvent.click(await screen.findByTestId('skill-detail-source-check-update'));
    await waitFor(() =>
      expect(arco.error).toHaveBeenCalledWith('settings.skillsHub.review.errors.skill_source_renamed')
    );
  });
});
