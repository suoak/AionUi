/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 3.0 V7: pure helpers for the Installed extensions page. Uses only the
 * existing `/api/extensions*` routes (no new Core endpoints).
 */

import type { IExtensionInfo } from '@/common/adapter/ipcBridge';

export type ContributionKind = 'settingsTabs' | 'commands' | 'panels' | 'views';

export type ContributionCounts = Record<ContributionKind, number>;

export const CONTRIBUTION_KINDS: readonly ContributionKind[] = ['settingsTabs', 'commands', 'panels', 'views'];

const emptyCounts = (): ContributionCounts => ({ settingsTabs: 0, commands: 0, panels: 0, views: 0 });

/** Counts the listed contributions per extension name. */
export function countContributions(
  lists: Partial<Record<ContributionKind, ReadonlyArray<{ extensionName?: string }> | null | undefined>>
): Map<string, ContributionCounts> {
  const result = new Map<string, ContributionCounts>();
  for (const kind of CONTRIBUTION_KINDS) {
    for (const entry of lists[kind] ?? []) {
      if (!entry?.extensionName) continue;
      const counts = result.get(entry.extensionName) ?? emptyCounts();
      counts[kind] += 1;
      result.set(entry.extensionName, counts);
    }
  }
  return result;
}

export const KNOWN_SOURCES = ['local', 'appdata', 'env'] as const;
export type KnownSource = (typeof KNOWN_SOURCES)[number];
export const isKnownSource = (source: string): source is KnownSource =>
  (KNOWN_SOURCES as readonly string[]).includes(source);

export type RiskLevel = 'safe' | 'moderate' | 'dangerous';
export const isRiskLevel = (value: unknown): value is RiskLevel =>
  value === 'safe' || value === 'moderate' || value === 'dangerous';

export type PermissionDetail = { permission: string; level: string; description: string };
export type PermissionsView = { riskLevel?: RiskLevel; details: PermissionDetail[] };

/**
 * Normalizes `POST /api/extensions/permissions` (`{ permissions, risk_level, details }`
 * in Core 0.5.x) defensively so an older or newer shape never breaks the page.
 */
export function normalizePermissions(raw: unknown): PermissionsView {
  if (!raw || typeof raw !== 'object') return { details: [] };
  const record = raw as Record<string, unknown>;
  const risk = record.risk_level ?? record.riskLevel;
  const details = Array.isArray(record.details)
    ? record.details
        .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
        .map((d) => ({
          permission: String(d.permission ?? d.name ?? ''),
          level: String(d.level ?? ''),
          description: String(d.description ?? ''),
        }))
        .filter((d) => d.permission.length > 0)
    : [];
  return { riskLevel: isRiskLevel(risk) ? risk : undefined, details };
}

/** Sorts by display name (case-insensitive), then by name. */
const sortLabel = (e: IExtensionInfo) => (e.display_name || e.name).toLocaleLowerCase();

export function sortExtensions(list: readonly IExtensionInfo[]): IExtensionInfo[] {
  return list.toSorted((a, b) => sortLabel(a).localeCompare(sortLabel(b)) || a.name.localeCompare(b.name));
}

/** Case-insensitive filter over display name, name and description. */
export function filterExtensions(list: readonly IExtensionInfo[], query: string): IExtensionInfo[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [...list];
  return list.filter((e) =>
    [e.display_name, e.name, e.description ?? ''].some((field) => (field ?? '').toLocaleLowerCase().includes(q))
  );
}
