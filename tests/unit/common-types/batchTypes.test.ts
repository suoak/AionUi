/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  BATCH_ITEM_STATUSES,
  BATCH_JOB_STATUSES,
  asBatchItemStatus,
  asBatchJobStatus,
} from '@/common/types/agent/batch';

describe('batch types (M8 E8-1 stubs)', () => {
  it('lists job statuses matching Core migration 076 CHECK', () => {
    expect([...BATCH_JOB_STATUSES]).toEqual([
      'draft',
      'trial',
      'running',
      'paused',
      'completed',
      'failed',
      'cancelled',
    ]);
  });

  it('lists item statuses matching Core migration 076 CHECK', () => {
    expect([...BATCH_ITEM_STATUSES]).toEqual([
      'pending',
      'running',
      'passed',
      'failed',
      'timeout',
      'skipped',
      'cancelled',
    ]);
  });

  it('narrows known statuses and rejects unknowns without throwing', () => {
    expect(asBatchJobStatus('draft')).toBe('draft');
    expect(asBatchJobStatus('scale')).toBeNull();
    expect(asBatchItemStatus('timeout')).toBe('timeout');
    expect(asBatchItemStatus('ok')).toBeNull();
  });
});
