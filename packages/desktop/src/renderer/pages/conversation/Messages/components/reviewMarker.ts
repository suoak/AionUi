/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reading of the `[[AION_REVIEW]]` block Core sends for a review batch (M7 E4
 * design §6.3), so the user's own message shows a "N notes sent" card instead
 * of the raw block. The block is Core's frozen text; this only reads it back.
 */

export const AION_REVIEW_OPEN = '[[AION_REVIEW ';
export const AION_REVIEW_CLOSE = '[[/AION_REVIEW]]';

export type ReviewBlockNote = {
  /** `#n` in the block; the agent reports back with the same number. */
  number: number;
  /** `src/a.rs  L3–L5（新版本）…` as Core wrote it. */
  heading: string;
  /** The user's note (first comment), possibly multi-line. */
  note: string;
};

export type ReviewBlock = {
  batchId: string;
  count: number;
  /** Instruction text before the first note. */
  preface: string;
  notes: ReviewBlockNote[];
  /** The whole block, for the expanded view. */
  raw: string;
};

const HEADER = /^\[\[AION_REVIEW batch=(\S+) count=(\d+)\]\]$/;
const HEADING = /^#(\d+) (\S.*\sL\d+.*)$/;
const FENCE = /^(`{3,}|~{3,})/;
const NOTE_PREFIX = '批注：';

/** Parse a message that is a review block; anything else returns `null`. */
export const parseReviewBlock = (content: string): ReviewBlock | null => {
  const raw = content.trim();
  if (!raw.startsWith(AION_REVIEW_OPEN) || !raw.endsWith(AION_REVIEW_CLOSE)) return null;
  const lines = raw.split(/\r?\n/);
  const header = HEADER.exec(lines[0] ?? '');
  if (!header) return null;

  const prefaceLines: string[] = [];
  const notes: ReviewBlockNote[] = [];
  let current: ReviewBlockNote | undefined;
  let fence: string | undefined;
  let inNote = false;
  for (let i = 1; i < lines.length - 1; i += 1) {
    const line = lines[i];
    if (fence) {
      if (line.startsWith(fence) && line.slice(fence.length).trim() === '') fence = undefined;
      continue;
    }
    const heading = lines[i - 1] === '' ? HEADING.exec(line) : null;
    if (heading) {
      current = { number: Number(heading[1]), heading: heading[2], note: '' };
      notes.push(current);
      inNote = false;
      continue;
    }
    if (!current) {
      prefaceLines.push(line);
      continue;
    }
    const opened = FENCE.exec(line);
    if (opened) {
      fence = opened[1];
      inNote = false;
      continue;
    }
    if (line.startsWith(NOTE_PREFIX)) {
      current.note = line.slice(NOTE_PREFIX.length);
      inNote = true;
    } else if (inNote && !/^(用户回复|Agent 回复)：/.test(line)) {
      current.note += `\n${line}`;
    } else {
      inNote = false;
    }
  }
  for (const note of notes) note.note = note.note.trimEnd();

  return {
    batchId: header[1],
    count: Number(header[2]),
    preface: prefaceLines.join('\n').trim(),
    notes,
    raw,
  };
};
