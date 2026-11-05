/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IGovernanceMe } from '@/common/types/governance';

/** True when the agent directory is empty because member RBAC filtered the catalog. */
export function isEmptyDueToPermissions(
  me: IGovernanceMe | null | undefined,
  opts: { loading: boolean; loadError: string | null; itemCount: number }
): boolean {
  if (opts.loading || opts.loadError || opts.itemCount > 0) return false;
  return Boolean(me?.roles_active && me.role === 'member');
}
