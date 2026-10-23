/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UsageCostAmount, UsageSummaryGroup } from '@/common/adapter/ipcBridge';

export type CostCell =
  /** No turn in the group reported a cost: show "unavailable", never 0. */
  | { kind: 'unavailable' }
  /** One entry per currency, never converted. */
  | { kind: 'amounts'; amounts: UsageCostAmount[]; partial: boolean };

export function costCell(group: Pick<UsageSummaryGroup, 'cost' | 'cost_status'>): CostCell {
  if (!group.cost || group.cost.length === 0 || group.cost_status === 'unavailable') {
    return { kind: 'unavailable' };
  }
  const amounts = [...group.cost].sort((a, b) => a.currency.localeCompare(b.currency));
  return { kind: 'amounts', amounts, partial: group.cost_status === 'partial' };
}

/** Client timezone as minutes east of UTC (what aioncore expects). */
export function clientTzOffsetMinutes(now = new Date()): number {
  return -now.getTimezoneOffset();
}
