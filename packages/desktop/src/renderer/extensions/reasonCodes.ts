/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fixed CSBU WorkMate extension reason-code catalogue (Core E13 S16).
 * Detection matches the Host: split on every character that is not
 * `a-z`, `0-9` or `_`, then take the first token that is in this list.
 */

export const EXTENSION_REASON_CODES = [
  'entry_point_integrity_declared_unchecked_serve',
  'signed_entry_point_integrity_declared_unchecked_serve',
  'signed_snapshot_inconclusive',
  'verified_asset_invalid_snapshot',
  'verified_asset_not_listed',
  'verified_asset_missing',
  'verified_asset_unreadable',
  'verified_asset_integrity_mismatch',
  'verified_asset_unavailable',
  'theme_css_invalid_path',
  'theme_css_not_utf8',
  'entry_point_integrity_declared_unchecked_spawn',
  'signed_entry_point_integrity_declared_unchecked_spawn',
  'bound_service_root_missing',
  'bound_service_invalid_snapshot',
  'bound_service_signed_snapshot_inconclusive',
  'bound_service_integrity_required',
  'bound_service_entry_mismatch',
  'bound_service_entry_missing',
  'bound_service_entry_unreadable',
  'bound_service_integrity_mismatch',
  'bound_service_verified_read_unavailable',
  'bound_service_runtime_required',
  'bound_service_runtime_unsupported',
  'bound_service_shell_script_unsupported',
  'bound_service_native_unsupported',
  'bound_service_entry_kind_unsupported',
  'bound_service_capabilities_unavailable',
  'bound_service_runtime_requires_signed_files',
  'bound_service_runner_unavailable',
  'integrity_binding_unavailable',
  'agent_tool_not_plan_safe',
  'handler_integrity_checked',
  'name_reserved_by_builtin',
  'hub_package_not_found',
  'hub_verification_failed',
  'hub_not_installed',
  'hub_remove_failed',
  'curated_install_refused',
  'curated_not_in_index',
  'curated_not_curated',
  'curated_not_allowlisted',
  'curated_integrity_missing',
  'curated_integrity_mismatch',
  'curated_signature_required',
  'curated_signature_missing_key_id',
  'curated_signature_invalid',
  'curated_unknown_key',
  'curated_key_config_invalid',
  'signature_manifest_limit',
  'signature_metadata_limit',
  'signature_invalid_identity',
  'signature_not_allowlisted',
  'signature_missing_key_id',
  'signature_invalid_key_id',
  'signature_unknown_key',
  'signature_missing_integrity',
  'signature_invalid_integrity',
  'signature_integrity_mismatch',
  'signature_missing_signature',
  'signature_invalid_signature',
  'signature_invalid_manifest',
  'signature_identity_mismatch',
  'package_invalid',
  'package_limit_exceeded',
  'package_unsafe_entry_name',
  'package_duplicate_entry',
  'package_symlink_or_special_entry',
  'package_entry_not_covered_by_signature',
  'package_covered_file_missing',
  'package_invalid_covered_path',
  'package_conflicting_covered_digest',
  'package_manifest_mismatch',
  'package_integrity_mismatch',
  'package_invalid_dir_name',
  'package_case_collision',
  'package_place_failed',
  'package_version_slot_blocked',
  'package_lifecycle_hooks_refused',
  'package_downgrade_refused',
  'package_marker_write_failed',
  'package_parent_not_directory',
  'package_remove_failed',
  'package_root_create_failed',
  'package_write_failed',
  'package_retain_failed',
  'package_unsupported_platform',
] as const;

export type ExtensionReasonCode = (typeof EXTENSION_REASON_CODES)[number];

const EXTENSION_REASON_CODE_SET: ReadonlySet<string> = new Set(EXTENSION_REASON_CODES);

/** Split `text` on anything other than [a-z0-9_] and return the first catalogue code. */
export function findExtensionReasonCode(text: string | null | undefined): ExtensionReasonCode | null {
  if (!text) return null;
  for (const token of text.split(/[^a-z0-9_]+/)) {
    if (token && EXTENSION_REASON_CODE_SET.has(token)) {
      return token as ExtensionReasonCode;
    }
  }
  return null;
}

export function extensionReasonI18nKey(
  code: ExtensionReasonCode
): `common.extensionReasonCodes.${ExtensionReasonCode}` {
  return `common.extensionReasonCodes.${code}`;
}

function stringifyUnknown(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Gather text from errors, HTTP envelopes, hub `msg`, and tool `reason` fields. */
export function collectErrorText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Error) {
    const extra: string[] = [value.message];
    const rec = value as Error & { backendMessage?: unknown; body?: unknown; msg?: unknown };
    if (typeof rec.backendMessage === 'string') extra.push(rec.backendMessage);
    if (typeof rec.msg === 'string') extra.push(rec.msg);
    if (rec.body !== undefined) extra.push(stringifyUnknown(rec.body));
    return extra.filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const parts = [rec.msg, rec.error, rec.message, rec.reason, rec.backendMessage, rec.installError].filter(
      (part): part is string => typeof part === 'string' && part.length > 0
    );
    if (rec.body !== undefined && rec.body !== value) {
      parts.push(typeof rec.body === 'string' ? rec.body : collectErrorText(rec.body));
    }
    if (rec.details !== undefined && rec.details !== value && rec.details !== rec.body) {
      parts.push(typeof rec.details === 'string' ? rec.details : collectErrorText(rec.details));
    }
    if (parts.length > 0) return parts.filter(Boolean).join('\n');
    return stringifyUnknown(value);
  }
  return String(value);
}

export function findExtensionReasonCodeIn(value: unknown): ExtensionReasonCode | null {
  return findExtensionReasonCode(collectErrorText(value));
}
