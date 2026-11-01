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
  getTeamSkillLibrary: { invoke: vi.fn() },
  setSkillVisibility: { invoke: vi.fn() },
  copyTeamSkillToPrivate: { invoke: vi.fn() },
  getSkillSourceDetail: { invoke: vi.fn() },
  refreshSkillFromSource: { invoke: vi.fn() },
}));
const arco = vi.hoisted(() => ({
  error: vi.fn(),
  warning: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('@/common', () => ({ ipcBridge: { fs: fsMock } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@arco-design/web-react', async (orig) => {
  const actual = await orig<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: { ...actual.Message, error: arco.error, info: arco.info, warning: arco.warning, success: arco.success },
    Modal: { ...actual.Modal, confirm: arco.confirm },
  };
});

import TeamSkillLibrary from '@/renderer/pages/settings/SkillsSettings/TeamSkillLibrary';
import { TeamShareControl } from '@/renderer/pages/settings/SkillsSettings/SkillSourceSection';
import {
  isTeamLibraryEnabled,
  skillReviewErrorKey,
  teamSkillActions,
} from '@/renderer/pages/settings/SkillsSettings/skillReviewModel';

const teamSkill = (id: string, extra: Record<string, unknown> = {}) => ({
  skill_id: id,
  name: `skill-${id}`,
  description: 'd',
  owner_user_id: 'u-other',
  review_status: 'none',
  mine: false,
  updated_at: 1,
  ...extra,
});
const library = (can_manage: boolean, skills: unknown[]) => ({
  enabled: true,
  team_id: 'installation',
  can_manage,
  skills,
});
const wrap = (node: React.ReactNode) =>
  render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{node}</SWRConfig>);
const acceptConfirm = async () => {
  await waitFor(() => expect(arco.confirm).toHaveBeenCalled());
  const cfg = arco.confirm.mock.calls.at(-1)![0] as { onOk: () => Promise<void> };
  await cfg.onOk();
};

describe('team skill model (E10-5)', () => {
  it('members copy usable skills of others; owners/admins and authors unpublish', () => {
    expect(teamSkillActions({ mine: false, review_status: 'none' }, false)).toEqual({
      canCopy: true,
      canUnpublish: false,
    });
    expect(teamSkillActions({ mine: false, review_status: 'pending' }, true)).toEqual({
      canCopy: false,
      canUnpublish: true,
    });
    expect(teamSkillActions({ mine: true, review_status: 'approved' }, false)).toEqual({
      canCopy: false,
      canUnpublish: true,
    });
  });

  it('the team entry is hidden unless Core reports a team library', () => {
    expect(isTeamLibraryEnabled(undefined)).toBe(false);
    expect(isTeamLibraryEnabled(null)).toBe(false);
    expect(isTeamLibraryEnabled({ enabled: false })).toBe(false);
    expect(isTeamLibraryEnabled({ enabled: true })).toBe(true);
  });

  it('maps team error reasons to i18n keys', () => {
    const err = new BackendHttpError({
      method: 'POST',
      path: '/api/skills/id/s1/copy-to-private',
      status: 409,
      body: { code: 'CONFLICT', error: "skill_name_taken: you already have a skill named 'x'" },
    });
    expect(skillReviewErrorKey(err)).toBe('settings.skillsHub.review.errors.skill_name_taken');
  });
});

describe('TeamSkillLibrary (E10-5)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when the library is disabled or Core is older', async () => {
    fsMock.getTeamSkillLibrary.invoke.mockRejectedValue(new Error('404'));
    const { container } = wrap(<TeamSkillLibrary />);
    await waitFor(() => expect(fsMock.getTeamSkillLibrary.invoke).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('[data-testid="team-skill-library"]')).toBeNull());
  });

  it('a member copies a team skill and cannot unpublish it', async () => {
    fsMock.getTeamSkillLibrary.invoke.mockResolvedValue(library(false, [teamSkill('a')]));
    fsMock.copyTeamSkillToPrivate.invoke.mockResolvedValue({ skill: { review_status: 'none' } });
    const onCopied = vi.fn();
    wrap(<TeamSkillLibrary onCopied={onCopied} />);
    fireEvent.click(await screen.findByTestId('team-skill-copy-a'));
    await waitFor(() => expect(onCopied).toHaveBeenCalled());
    expect(fsMock.copyTeamSkillToPrivate.invoke).toHaveBeenCalledWith({ skill_id: 'a' });
    expect(arco.success).toHaveBeenCalledWith('settings.skillsHub.team.copied');
    expect(screen.queryByTestId('team-skill-unpublish-a')).toBeNull();
  });

  it('a copy with scripts is reported as waiting for review', async () => {
    fsMock.getTeamSkillLibrary.invoke.mockResolvedValue(library(false, [teamSkill('a')]));
    fsMock.copyTeamSkillToPrivate.invoke.mockResolvedValue({ skill: { review_status: 'pending' } });
    wrap(<TeamSkillLibrary />);
    fireEvent.click(await screen.findByTestId('team-skill-copy-a'));
    await waitFor(() => expect(arco.warning).toHaveBeenCalledWith('settings.skillsHub.team.copiedNeedsReview'));
  });

  it('an admin sees held skills and unpublishes after confirming', async () => {
    fsMock.getTeamSkillLibrary.invoke.mockResolvedValue(
      library(true, [teamSkill('a'), teamSkill('b', { review_status: 'pending' })])
    );
    fsMock.setSkillVisibility.invoke.mockResolvedValue({});
    wrap(<TeamSkillLibrary />);
    await screen.findByTestId('team-skill-held-b');
    expect(screen.queryByTestId('team-skill-copy-b')).toBeNull();
    fireEvent.click(screen.getByTestId('team-skill-unpublish-a'));
    await acceptConfirm();
    expect(fsMock.setSkillVisibility.invoke).toHaveBeenCalledWith({ skill_id: 'a', visibility: 'private' });
  });
});

describe('TeamShareControl on the skill detail page (E10-5)', () => {
  beforeEach(() => vi.clearAllMocks());
  const gov = (visibility: string) => ({
    skill_id: 's1',
    name: 'mine',
    visibility,
    team_id: visibility === 'team' ? 'installation' : null,
    review_status: 'none',
  });

  it('is hidden without a team library', async () => {
    fsMock.getTeamSkillLibrary.invoke.mockResolvedValue({
      enabled: false,
      team_id: null,
      can_manage: false,
      skills: [],
    });
    wrap(<TeamShareControl skill={gov('private')} sourceKey='k' />);
    await waitFor(() => expect(fsMock.getTeamSkillLibrary.invoke).toHaveBeenCalled());
    expect(screen.queryByTestId('skill-detail-team-publish')).toBeNull();
  });

  it('members cannot publish', async () => {
    fsMock.getTeamSkillLibrary.invoke.mockResolvedValue(library(false, []));
    wrap(<TeamShareControl skill={gov('private')} sourceKey='k' />);
    await waitFor(() => expect(fsMock.getTeamSkillLibrary.invoke).toHaveBeenCalled());
    expect(screen.queryByTestId('skill-detail-team-publish')).toBeNull();
  });

  it('owner/admin publishes after confirming; a shared skill can be unshared', async () => {
    fsMock.getTeamSkillLibrary.invoke.mockResolvedValue(library(true, []));
    fsMock.setSkillVisibility.invoke.mockResolvedValue({});
    const { unmount } = wrap(<TeamShareControl skill={gov('private')} sourceKey='k' />);
    fireEvent.click(await screen.findByTestId('skill-detail-team-publish'));
    await acceptConfirm();
    expect(fsMock.setSkillVisibility.invoke).toHaveBeenCalledWith({ skill_id: 's1', visibility: 'team' });
    unmount();

    wrap(<TeamShareControl skill={gov('team')} sourceKey='k' />);
    expect(await screen.findByTestId('skill-detail-team-shared')).toBeTruthy();
    fireEvent.click(screen.getByTestId('skill-detail-team-unpublish'));
    await waitFor(() =>
      expect(fsMock.setSkillVisibility.invoke).toHaveBeenCalledWith({ skill_id: 's1', visibility: 'private' })
    );
  });
});
