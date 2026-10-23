/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import type { ScmRepository } from '@/renderer/pages/conversation/SourceControl/scmModel';
import {
  expandableRepoIds,
  groupRepositories,
  isManagedWorktree,
  type ScmRepoGroup,
} from '@/renderer/pages/conversation/SourceControl/scmRepoTree';

const repo = (over: Partial<ScmRepository> & { repo_id: string; label: string }): ScmRepository => ({
  provider_id: 'git',
  root: { pe_id: over.repo_id, relative_path: '' },
  capabilities: { staging: true, local_branches: true, history_graph: true, remote_ops: true },
  state: 'idle',
  ...over,
});

const primary = (g: ScmRepoGroup): Extract<ScmRepoGroup, { kind: 'primary' }> => {
  if (g.kind !== 'primary') throw new Error(`expected primary, got ${g.kind}`);
  return g;
};

const names = (repos: ScmRepository[]): string[] => repos.map((r) => r.pe_name || r.label);

describe('groupRepositories', () => {
  it('renders ordinary repos flat, alphabetically, with no worktree children', () => {
    const groups = groupRepositories([
      repo({ repo_id: 'scm:b', label: 'beta' }),
      repo({ repo_id: 'scm:a', label: 'alpha' }),
    ]);
    expect(groups.map((g) => g.repo.repo_id)).toEqual(['scm:a', 'scm:b']);
    expect(groups.every((g) => g.kind === 'primary')).toBe(true);
    expect(primary(groups[0]).worktrees).toEqual([]);
  });

  it('nests a worktree under its primary when the primary is present', () => {
    const groups = groupRepositories([
      repo({ repo_id: 'scm:pe1', label: 'main-repo' }),
      repo({ repo_id: 'scm:pe1/wt-a', label: 'wt-a', is_worktree: true, worktree_of: 'scm:pe1' }),
    ]);
    expect(groups).toHaveLength(1);
    const p = primary(groups[0]);
    expect(p.repo.repo_id).toBe('scm:pe1');
    expect(names(p.worktrees)).toEqual(['wt-a']);
  });

  it('sorts nested worktrees alphabetically among themselves', () => {
    const groups = groupRepositories([
      repo({ repo_id: 'scm:pe1', label: 'main-repo' }),
      repo({ repo_id: 'scm:pe1/z', label: 'z-tree', is_worktree: true, worktree_of: 'scm:pe1' }),
      repo({ repo_id: 'scm:pe1/a', label: 'a-tree', is_worktree: true, worktree_of: 'scm:pe1' }),
      repo({ repo_id: 'scm:pe1/m', label: 'm-tree', is_worktree: true, worktree_of: 'scm:pe1' }),
    ]);
    expect(names(primary(groups[0]).worktrees)).toEqual(['a-tree', 'm-tree', 'z-tree']);
  });

  it('surfaces a worktree at the outer level when its primary is not in view', () => {
    const groups = groupRepositories([
      repo({ repo_id: 'scm:pe2', label: 'other' }),
      repo({ repo_id: 'scm:pe1/wt', label: 'stray-tree', is_worktree: true, worktree_of: 'scm:pe1' }),
    ]);
    expect(groups).toHaveLength(2);
    const orphan = groups.find((g) => g.repo.repo_id === 'scm:pe1/wt');
    expect(orphan?.kind).toBe('orphanWorktree');
  });

  it('treats is_worktree without worktree_of as an orphan worktree', () => {
    const groups = groupRepositories([repo({ repo_id: 'scm:pe1/wt', label: 'lonely', is_worktree: true })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('orphanWorktree');
  });

  it('never drops a worktree whose worktree_of points at an absent id', () => {
    const groups = groupRepositories([
      repo({ repo_id: 'scm:pe1/wt', label: 'ghost-child', is_worktree: true, worktree_of: 'scm:missing' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('orphanWorktree');
    expect(groups[0].repo.repo_id).toBe('scm:pe1/wt');
  });

  it('interleaves primaries and orphan worktrees in a single alphabetical outer order', () => {
    const groups = groupRepositories([
      repo({ repo_id: 'scm:p', label: 'mango' }),
      repo({ repo_id: 'scm:o', label: 'apple', is_worktree: true, worktree_of: 'scm:absent' }),
      repo({ repo_id: 'scm:q', label: 'zebra' }),
    ]);
    expect(groups.map((g) => g.repo.label)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('handles a mixed workspace: primary with children, plain repo, and orphan', () => {
    const groups = groupRepositories([
      repo({ repo_id: 'scm:pe1', label: 'core' }),
      repo({ repo_id: 'scm:pe1/wt2', label: 'feature-b', is_worktree: true, worktree_of: 'scm:pe1' }),
      repo({ repo_id: 'scm:pe1/wt1', label: 'feature-a', is_worktree: true, worktree_of: 'scm:pe1' }),
      repo({ repo_id: 'scm:pe3', label: 'docs' }),
      repo({ repo_id: 'scm:x/wt', label: 'stray', is_worktree: true, worktree_of: 'scm:gone' }),
    ]);
    // Outer order: core, docs, stray (alphabetical).
    expect(groups.map((g) => g.repo.label)).toEqual(['core', 'docs', 'stray']);
    const core = primary(groups[0]);
    expect(names(core.worktrees)).toEqual(['feature-a', 'feature-b']);
    expect(groups[2].kind).toBe('orphanWorktree');
  });

  it('is deterministic across input permutations', () => {
    const input: ScmRepository[] = [
      repo({ repo_id: 'scm:pe1', label: 'core' }),
      repo({ repo_id: 'scm:pe1/b', label: 'b', is_worktree: true, worktree_of: 'scm:pe1' }),
      repo({ repo_id: 'scm:pe1/a', label: 'a', is_worktree: true, worktree_of: 'scm:pe1' }),
      repo({ repo_id: 'scm:pe2', label: 'app' }),
    ];
    const forward = JSON.stringify(groupRepositories(input));
    const reversed = JSON.stringify(groupRepositories([...input].toReversed()));
    expect(forward).toEqual(reversed);
  });
});

describe('expandableRepoIds', () => {
  it('lists only primaries that actually have nested worktrees', () => {
    const groups = groupRepositories([
      repo({ repo_id: 'scm:pe1', label: 'core' }),
      repo({ repo_id: 'scm:pe1/wt', label: 'wt', is_worktree: true, worktree_of: 'scm:pe1' }),
      repo({ repo_id: 'scm:pe2', label: 'plain' }),
      repo({ repo_id: 'scm:x/o', label: 'orphan', is_worktree: true }),
    ]);
    expect(expandableRepoIds(groups)).toEqual(['scm:pe1']);
  });
});

const groupIds = (groups: ScmRepoGroup[]) =>
  groups.map((g) => (g.kind === 'primary' ? [g.repo.repo_id, g.worktrees.map((w) => w.repo_id)] : g.repo.repo_id));

describe('isManagedWorktree (M7 E3-3)', () => {
  it('is true only when Core back-filled a managed worktree id', () => {
    expect(isManagedWorktree(repo({ repo_id: 'a', label: 'a', is_worktree: true, managed_worktree_id: 'wt-1' }))).toBe(
      true
    );
    expect(isManagedWorktree(repo({ repo_id: 'b', label: 'b', is_worktree: true }))).toBe(false);
    expect(isManagedWorktree(repo({ repo_id: 'c', label: 'c', managed_worktree_id: '' }))).toBe(false);
  });

  it('does not change grouping', () => {
    const plain = [
      repo({ repo_id: 'scm:p', label: 'p' }),
      repo({ repo_id: 'scm:w', label: 'w', is_worktree: true, worktree_of: 'scm:p' }),
    ];
    const managed = [plain[0], { ...plain[1], managed_worktree_id: 'wt-1' }];
    expect(groupIds(groupRepositories(managed))).toEqual(groupIds(groupRepositories(plain)));
  });
});
