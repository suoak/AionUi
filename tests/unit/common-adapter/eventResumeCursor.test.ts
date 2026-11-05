/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import {
  applyResumeComplete,
  buildResumeMessage,
  createMemoryCursorStore,
  createSessionCursorStore,
  cursorFromEnvelope,
  isEventCursor,
  maxCursor,
} from '@/common/adapter/eventResumeCursor';

describe('eventResumeCursor', () => {
  it('validates cursor shapes', () => {
    expect(isEventCursor({ epoch: 1, sequence: 2 })).toBe(true);
    expect(isEventCursor({ epoch: '1', sequence: 2 })).toBe(false);
    expect(isEventCursor(null)).toBe(false);
  });

  it('extracts cursor from envelope', () => {
    expect(cursorFromEnvelope({ name: 'x', data: {}, cursor: { epoch: 1, sequence: 3 } })).toEqual({
      epoch: 1,
      sequence: 3,
    });
    expect(cursorFromEnvelope({ name: 'x', data: {} })).toBeNull();
  });

  it('maxCursor prefers later epoch/sequence', () => {
    expect(maxCursor({ epoch: 1, sequence: 5 }, { epoch: 2, sequence: 1 })).toEqual({ epoch: 2, sequence: 1 });
    expect(maxCursor({ epoch: 1, sequence: 5 }, { epoch: 1, sequence: 9 })).toEqual({ epoch: 1, sequence: 9 });
  });

  it('memory store notes monotonic progress', () => {
    const store = createMemoryCursorStore(null);
    store.note({ epoch: 1, sequence: 1 });
    store.note({ epoch: 1, sequence: 4 });
    store.note({ epoch: 1, sequence: 2 });
    expect(store.get()).toEqual({ epoch: 1, sequence: 4 });
  });

  it('session store round-trips via Storage mock', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    } as Storage;
    const store = createSessionCursorStore(storage);
    store.set({ epoch: 3, sequence: 7 });
    const again = createSessionCursorStore(storage);
    expect(again.get()).toEqual({ epoch: 3, sequence: 7 });
    again.clear();
    expect(createSessionCursorStore(storage).get()).toBeNull();
  });

  it('buildResumeMessage omits cursor when unset', () => {
    expect(buildResumeMessage(null)).toEqual({ name: 'resume', data: {} });
    expect(buildResumeMessage({ epoch: 1, sequence: 9 })).toEqual({
      name: 'resume',
      data: {},
      cursor: { epoch: 1, sequence: 9 },
    });
  });

  it('applyResumeComplete prefers envelope cursor', () => {
    const store = createMemoryCursorStore(null);
    applyResumeComplete(store, { status: 'ok', epoch: 1, sequence: 2 }, { epoch: 1, sequence: 5 });
    expect(store.get()).toEqual({ epoch: 1, sequence: 5 });
  });
});
