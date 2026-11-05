import { describe, expect, it } from 'vitest';
import { isEmptyDueToPermissions } from '@/renderer/pages/agent-center/agentCenterEmpty';
import type { IGovernanceMe } from '@/common/types/governance';

const memberActive: IGovernanceMe = {
  user_id: 'u1',
  role: 'member',
  roles_active: true,
  can_manage_policies: false,
  can_manage_roles: false,
  can_view_all_audit: false,
};

describe('isEmptyDueToPermissions', () => {
  it('is true for member with roles active and empty list', () => {
    expect(isEmptyDueToPermissions(memberActive, { loading: false, loadError: null, itemCount: 0 })).toBe(true);
  });

  it('is false when items exist', () => {
    expect(isEmptyDueToPermissions(memberActive, { loading: false, loadError: null, itemCount: 2 })).toBe(false);
  });

  it('is false for owner / desktop (roles inactive)', () => {
    expect(
      isEmptyDueToPermissions(
        { ...memberActive, role: 'owner', roles_active: false },
        { loading: false, loadError: null, itemCount: 0 }
      )
    ).toBe(false);
  });

  it('is false while loading or on error', () => {
    expect(isEmptyDueToPermissions(memberActive, { loading: true, loadError: null, itemCount: 0 })).toBe(false);
    expect(isEmptyDueToPermissions(memberActive, { loading: false, loadError: 'boom', itemCount: 0 })).toBe(false);
  });
});
