/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  transcriptItemText,
  type JournalTranscript,
  type JournalTranscriptItem,
} from '@/common/types/journalTranscript';

export type TrajectoryKindKey = 'assistant' | 'user' | 'tool' | 'turnStart' | 'turnEnd' | 'turnError' | 'hostNotice';

export type TrajectoryLockKey = 'none' | 'open' | 'closed';

const PREVIEW_CHAR_LIMIT = 160;

export function trajectoryKindKey(kind: string): TrajectoryKindKey {
  switch (kind) {
    case 'assistant/message':
      return 'assistant';
    case 'user/message':
      return 'user';
    case 'tool/call':
      return 'tool';
    case 'turn/start':
      return 'turnStart';
    case 'turn/end':
      return 'turnEnd';
    case 'turn/error':
      return 'turnError';
    default:
      return 'hostNotice';
  }
}

export function trajectoryKindI18nKey(kind: string): `conversation.trajectory.kind.${TrajectoryKindKey}` {
  return `conversation.trajectory.kind.${trajectoryKindKey(kind)}`;
}

export function compactionLockKey(lock: string): TrajectoryLockKey {
  return lock === 'open' || lock === 'closed' ? lock : 'none';
}

export function compactionLockI18nKey(lock: string): `conversation.trajectory.lock.${TrajectoryLockKey}` {
  return `conversation.trajectory.lock.${compactionLockKey(lock)}`;
}

export function isHostOnlyItem(item: Pick<JournalTranscriptItem, 'visibility'>): boolean {
  return item.visibility !== 'model';
}

export function isTranscriptReconstructible(
  transcript: Pick<JournalTranscript, 'model_surface_reconstructible'>
): boolean {
  return transcript.model_surface_reconstructible !== false;
}

export function trajectoryItemPreview(item: JournalTranscriptItem): string {
  const text = transcriptItemText(item).replace(/\s+/g, ' ').trim();
  if (text.length <= PREVIEW_CHAR_LIMIT) {
    return text;
  }
  return `${text.slice(0, PREVIEW_CHAR_LIMIT)}…`;
}
