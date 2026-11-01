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
  diffSkillVersions: { invoke: vi.fn() },
  restoreSkillVersion: { invoke: vi.fn() },
}));
const arco = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  success: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('@/common', () => ({ ipcBridge: { fs: fsMock } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'version' in opts ? `${key}:${String(opts.from ?? '')}:${String(opts.version)}` : key,
  }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@arco-design/web-react', async (orig) => {
  const actual = await orig<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: { ...actual.Message, error: arco.error, info: arco.info, warning: arco.warning, success: arco.success },
    Modal: { ...actual.Modal, confirm: arco.confirm },
  };
});

import SkillSourceSection from '@/renderer/pages/settings/SkillsSettings/SkillSourceSection';
import { defaultComparePair, restoredFromVersion } from '@/renderer/pages/settings/SkillsSettings/skillReviewModel';

const skill = (review_status = 'approved') => ({
  skill_id: 's1',
  name: 'deploy-helper',
  visibility: 'private',
  team_id: null,
  review_status,
});
const v = (version_no: number, extra: Record<string, unknown> = {}) => ({
  version_no,
  content_hash: `h${version_no}`,
  has_scripts: false,
  source_ref: null,
  created_by: 'user',
  created_at: 1,
  manifest: {},
  ...extra,
});
const source = (trust = 'trusted') => ({
  kind: 'git',
  locator: 'https://example.com/a.git',
  ref: null,
  subpath: null,
  origin_app: null,
  trust,
  last_fetched_at: 1,
  last_commit: null,
});

const renderSection = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SkillSourceSection skillId='s1' />
    </SWRConfig>
  );

/** Run the onOk the component handed to Modal.confirm. */
const acceptConfirm = async () => {
  await waitFor(() => expect(arco.confirm).toHaveBeenCalled());
  const cfg = arco.confirm.mock.calls.at(-1)![0] as { onOk: () => Promise<void> };
  await cfg.onOk();
};

describe('SkillSourceSection version compare / restore (E10-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers no compare and no restore with a single version', async () => {
    fsMock.getSkillSourceDetail.invoke.mockResolvedValue({ skill: skill(), source: source(), versions: [v(1)] });
    renderSection();
    await screen.findByTestId('skill-review-version-1');
    expect(screen.queryByTestId('skill-version-compare')).toBeNull();
    expect(screen.queryByTestId('skill-version-restore-1')).toBeNull();
  });

  it('compares previous → newest and renders the file list', async () => {
    fsMock.getSkillSourceDetail.invoke.mockResolvedValue({
      skill: skill(),
      source: source(),
      versions: [v(2), v(1)],
    });
    fsMock.diffSkillVersions.invoke.mockResolvedValue({
      skill_id: 's1',
      from_version: 1,
      to_version: 2,
      files: [
        {
          path: 'SKILL.md',
          status: 'modified',
          binary: false,
          script: false,
          diff: '--- a/SKILL.md\n+++ b/SKILL.md\n@@ -1 +1 @@\n-old\n+new\n',
          too_large: false,
        },
        { path: 'logo.png', status: 'added', binary: true, script: false, diff: null, too_large: false },
        { path: 'scripts/run.sh', status: 'added', binary: false, script: true, diff: '+echo hi\n', too_large: false },
      ],
    });
    renderSection();
    fireEvent.click(await screen.findByTestId('skill-version-compare-run'));
    await screen.findByTestId('skill-version-diff');
    expect(fsMock.diffSkillVersions.invoke).toHaveBeenCalledWith({ skill_id: 's1', from: 1, to: 2 });
    expect(screen.getByText('+new')).toBeTruthy();
    expect(screen.getByText('-old')).toBeTruthy();
    expect(screen.getByText('settings.skillsHub.sourceSection.binaryFile')).toBeTruthy();
    expect(screen.getByTestId('skill-version-diff-file-scripts/run.sh').textContent).toContain(
      'settings.skillsHub.review.scriptsBadge'
    );
  });

  it('shows an empty state when two versions have no differences', async () => {
    fsMock.getSkillSourceDetail.invoke.mockResolvedValue({ skill: skill(), source: source(), versions: [v(2), v(1)] });
    fsMock.diffSkillVersions.invoke.mockResolvedValue({ skill_id: 's1', from_version: 1, to_version: 2, files: [] });
    renderSection();
    fireEvent.click(await screen.findByTestId('skill-version-compare-run'));
    expect(await screen.findByText('settings.skillsHub.sourceSection.noDifferences')).toBeTruthy();
  });

  it('restores an older version after confirmation (not offered on the newest)', async () => {
    fsMock.getSkillSourceDetail.invoke.mockResolvedValue({ skill: skill(), source: source(), versions: [v(2), v(1)] });
    fsMock.restoreSkillVersion.invoke.mockResolvedValue({
      skill: skill(),
      version: v(3, { source_ref: 'restore:v1' }),
      restored_from: 1,
      changed: true,
    });
    renderSection();
    fireEvent.click(await screen.findByTestId('skill-version-restore-1'));
    expect(screen.queryByTestId('skill-version-restore-2')).toBeNull();
    expect(fsMock.restoreSkillVersion.invoke).not.toHaveBeenCalled();
    await acceptConfirm();
    expect(fsMock.restoreSkillVersion.invoke).toHaveBeenCalledWith({ skill_id: 's1', version_no: 1 });
    expect(arco.success).toHaveBeenCalledWith('settings.skillsHub.sourceSection.restored:1:3');
  });

  it('warns about scripts in the confirmation and reports the review hold', async () => {
    fsMock.getSkillSourceDetail.invoke.mockResolvedValue({
      skill: skill(),
      source: source(),
      versions: [v(2), v(1, { has_scripts: true })],
    });
    fsMock.restoreSkillVersion.invoke.mockResolvedValue({
      skill: skill('pending'),
      version: v(3, { has_scripts: true }),
      restored_from: 1,
      changed: true,
    });
    renderSection();
    fireEvent.click(await screen.findByTestId('skill-version-restore-1'));
    await waitFor(() => expect(arco.confirm).toHaveBeenCalled());
    const { container } = render(<>{(arco.confirm.mock.calls[0][0] as { content: React.ReactNode }).content}</>);
    expect(container.textContent).toContain('settings.skillsHub.sourceSection.restoreScripts');
    await acceptConfirm();
    expect(arco.warning).toHaveBeenCalledWith('settings.skillsHub.sourceSection.restoredNeedsReview:1:3');
  });

  it('reports a no-op restore and maps the renamed-version error', async () => {
    fsMock.getSkillSourceDetail.invoke.mockResolvedValue({ skill: skill(), source: source(), versions: [v(2), v(1)] });
    fsMock.restoreSkillVersion.invoke.mockResolvedValueOnce({
      skill: skill(),
      version: v(2),
      restored_from: 1,
      changed: false,
    });
    renderSection();
    fireEvent.click(await screen.findByTestId('skill-version-restore-1'));
    await acceptConfirm();
    expect(arco.info).toHaveBeenCalledWith('settings.skillsHub.sourceSection.restoreNoChange::1');

    fsMock.restoreSkillVersion.invoke.mockRejectedValueOnce(
      new BackendHttpError({
        method: 'POST',
        path: '/x',
        status: 409,
        body: { success: false, error: "skill_restore_renamed: version 1 names the skill 'x'", code: 'CONFLICT' },
      })
    );
    fireEvent.click(screen.getByTestId('skill-version-restore-1'));
    await acceptConfirm();
    expect(arco.error).toHaveBeenCalledWith('settings.skillsHub.review.errors.skill_restore_renamed');
  });

  it('marks restored versions and keeps the untrusted-source warning', async () => {
    fsMock.getSkillSourceDetail.invoke.mockResolvedValue({
      skill: skill(),
      source: source('untrusted'),
      versions: [v(3, { source_ref: 'restore:v1' }), v(2), v(1)],
    });
    renderSection();
    const row = await screen.findByTestId('skill-review-version-3');
    expect(row.textContent).toContain('settings.skillsHub.review.restoredFrom::1');
    expect(screen.getByTestId('skill-review-untrusted')).toBeTruthy();
  });
});

describe('skillReviewModel restore helpers', () => {
  it('parses restore source refs', () => {
    expect(restoredFromVersion('restore:v12')).toBe(12);
    expect(restoredFromVersion('restore:vx')).toBeNull();
    expect(restoredFromVersion('abc123')).toBeNull();
    expect(restoredFromVersion(null)).toBeNull();
  });

  it('defaults to previous → newest', () => {
    expect(defaultComparePair([5, 4, 1])).toEqual({ from: 4, to: 5 });
    expect(defaultComparePair([1])).toBeNull();
  });
});
