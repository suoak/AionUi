/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure helpers that turn an Office / Deck preview into a Core review scope
 * and a one-line `diff_context` anchor. No React, no I/O.
 *
 * Core's `scope_kind: 'task_run'` does not read the binary file on disk, so
 * the anchor is taken from `diff_context.lines` directly. `normalize_file_path`
 * still requires a repo/workspace-relative POSIX path (non-empty, no leading
 * `/`, no Windows drive, no `..`, no empty segments), and `validate_range`
 * requires `start_line >= 1`, `end_line >= start_line`, and
 * `diff_context.lines.length === (end_line - start_line + 1)`.
 */

import type { ChatFileRef } from '@/common/types/chatFile';
import type { ReviewDiffContext, ReviewThread } from '@/common/types/agent/taskSession';
import type { ReviewScope } from './useReviewThreads';
import { routeConversationId } from './sendModel';

export type OfficeDocKind = 'ppt' | 'word' | 'excel' | 'presentation';

export type OfficeReviewScopeInput = {
  fileRef?: ChatFileRef;
  filePath?: string;
  fileName?: string;
  workspace?: string;
  routeHash?: string;
};

export type OfficeAnchorInput = {
  /** 1-based Slide #, Page/Section #, or Row #. Values below 1 are clamped to 1. */
  unitNumber: number;
  /** Translated unit name without the number, e.g. `Slide`, `Page`, `Row`. */
  unitLabel: string;
  /** Optional element or location, e.g. `Chart`, `Heading`, `C4:E10`. */
  elementLabel?: string;
  /** Optional snippet; newlines are collapsed so `lines` is always length 1. */
  snippet?: string;
};

export type OfficeAnchorFields = {
  side: 'new';
  start_line: number;
  end_line: number;
  diff_context: ReviewDiffContext;
};

const DEFAULT_FILE = 'document';
const MAX_SCOPE_ID = 4096;

const toPosix = (value: string): string => value.replace(/\\/g, '/');

/** Core `normalize_file_path`: relative POSIX, no `..`, no drive, no empty segments. */
export const sanitizeRelativePath = (value: string): string => {
  let path = toPosix(value).replace(/^\/+/, '');
  path = path.replace(/^[a-zA-Z]:\/?/, '').replace(/^\/+/, '');
  const segments = path.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0 || segments.some((segment) => segment === '..')) return '';
  return segments.join('/');
};

const basenamePosix = (value: string): string => {
  const trimmed = toPosix(value).replace(/\/+$/, '');
  const base = trimmed.split('/').pop() ?? '';
  return sanitizeRelativePath(base) || DEFAULT_FILE;
};

const pathsEqual = (left: string, right: string): boolean => left.toLowerCase() === right.toLowerCase();

const isInsideWorkspace = (filePath: string, workspace: string): boolean => {
  const file = toPosix(filePath);
  const root = toPosix(workspace).replace(/\/+$/, '');
  if (!root) return false;
  if (pathsEqual(file, root)) return false;
  return file.startsWith(`${root}/`) || file.toLowerCase().startsWith(`${root.toLowerCase()}/`);
};

/** Strip a workspace prefix from an absolute or workspace-relative file path. */
export const stripWorkspacePrefix = (filePath: string, workspace: string): string | undefined => {
  if (!isInsideWorkspace(filePath, workspace)) return undefined;
  const file = toPosix(filePath);
  const root = toPosix(workspace).replace(/\/+$/, '');
  const remainder = file.slice(root.length).replace(/^\/+/, '');
  const sanitized = sanitizeRelativePath(remainder);
  return sanitized || undefined;
};

const resolvedFilePath = (input: OfficeReviewScopeInput): string | undefined => {
  if (input.filePath) return input.filePath;
  if (input.fileRef && input.fileRef.kind !== 'project') return input.fileRef.path;
  return undefined;
};

/**
 * Build a `task_run` review scope for an Office / Deck artifact, or `undefined`
 * when the preview has no file identity (`fileRef`, `filePath`, or `fileName`).
 */
export const buildOfficeReviewScope = (input: OfficeReviewScopeInput): ReviewScope | undefined => {
  if (!input.fileRef && !input.filePath && !input.fileName) return undefined;

  const conversation_id = routeConversationId(input.routeHash ?? '');
  const rawScopeId = conversation_id
    ? `office:${conversation_id}`
    : input.workspace
      ? `office:${input.workspace}`
      : 'office:workspace';
  const scope_id = rawScopeId.slice(0, MAX_SCOPE_ID);

  let file_path: string | undefined;
  if (input.fileRef?.kind === 'project' && input.fileRef.relative_path) {
    file_path = sanitizeRelativePath(input.fileRef.relative_path) || basenamePosix(input.fileRef.relative_path);
  } else {
    const filePath = resolvedFilePath(input);
    if (filePath && input.workspace) {
      file_path = stripWorkspacePrefix(filePath, input.workspace) || basenamePosix(filePath);
    } else {
      file_path = basenamePosix(filePath || input.fileName || DEFAULT_FILE);
    }
  }

  return {
    scope_kind: 'task_run',
    scope_id,
    file_path: sanitizeRelativePath(file_path) || DEFAULT_FILE,
    ...(conversation_id ? { conversation_id } : {}),
  };
};

const collapseLine = (value: string): string =>
  value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** One-line Office anchor that always satisfies Core's `validate_range`. */
export const buildOfficeAnchorInput = (input: OfficeAnchorInput): OfficeAnchorFields => {
  const unitNumber = Math.max(1, Math.floor(Number.isFinite(input.unitNumber) ? input.unitNumber : 1));
  const unitLabel = collapseLine(input.unitLabel) || 'Unit';
  const elementLabel = input.elementLabel ? collapseLine(input.elementLabel) : '';
  const headerText = elementLabel ? `${unitLabel} ${unitNumber} · ${elementLabel}` : `${unitLabel} ${unitNumber}`;
  const snippet = input.snippet ? collapseLine(input.snippet) : '';
  const singleLineSummary = snippet || headerText;
  return {
    side: 'new',
    start_line: unitNumber,
    end_line: unitNumber,
    diff_context: {
      base: 'office-artifact',
      hunk_header: headerText,
      before: [],
      lines: [singleLineSummary],
      after: [],
    },
  };
};

const unitKey = (
  docType: OfficeDocKind
): 'preview.officeReview.slide' | 'preview.officeReview.page' | 'preview.officeReview.row' => {
  if (docType === 'word') return 'preview.officeReview.page';
  if (docType === 'excel') return 'preview.officeReview.row';
  return 'preview.officeReview.slide';
};

export const officeUnitLabelKey = (
  docType: OfficeDocKind
): 'preview.officeReview.slideLabel' | 'preview.officeReview.pageLabel' | 'preview.officeReview.rowLabel' => {
  if (docType === 'word') return 'preview.officeReview.pageLabel';
  if (docType === 'excel') return 'preview.officeReview.rowLabel';
  return 'preview.officeReview.slideLabel';
};

/** Concise badge such as `Slide 3 · Chart`, from the stored hunk header or the unit line. */
export const formatOfficeThreadTarget = (
  thread: Pick<ReviewThread, 'start_line' | 'anchor'>,
  docType: OfficeDocKind,
  t: (key: string, options?: Record<string, unknown>) => string
): string => {
  const header = thread.anchor.hunk_header?.replace(/\s+/g, ' ').trim();
  if (header) return header;
  return t(unitKey(docType), { number: thread.start_line });
};

export const countNotesForUnit = (threads: Pick<ReviewThread, 'status' | 'start_line'>[], unitNumber: number): number =>
  threads.filter((thread) => thread.status !== 'resolved' && thread.start_line === unitNumber).length;
