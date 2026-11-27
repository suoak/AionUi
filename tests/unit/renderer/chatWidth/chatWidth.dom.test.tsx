/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  const subs = new Map<string, Set<() => void>>();
  return {
    values,
    service: {
      whenReady: vi.fn(() => Promise.resolve()),
      get: (key: string) => values.get(key),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
        subs.get(key)?.forEach((cb) => cb());
      }),
      subscribe: (key: string, cb: () => void) => {
        if (!subs.has(key)) subs.set(key, new Set());
        subs.get(key)!.add(cb);
        return () => subs.get(key)?.delete(cb);
      },
    },
  };
});

vi.mock('@/common/config/configService', () => ({ configService: store.service }));

import { CHAT_WIDTH_MAX, DEFAULT_CHAT_WIDTH, sanitizeChatWidth } from '@/common/config/chatWidth';
import { useChatWidth } from '@/renderer/hooks/ui/useChatWidth';

afterEach(() => {
  cleanup();
  store.values.clear();
  document.documentElement.style.removeProperty('--wm-chat-max-width');
});

describe('chat width (3.0 V15)', () => {
  it('defaults to the standard 760px column and rejects unknown values', () => {
    expect(DEFAULT_CHAT_WIDTH).toBe('standard');
    expect(CHAT_WIDTH_MAX).toEqual({ standard: '760px', wide: '960px', full: 'none' });
    expect(sanitizeChatWidth('wide')).toBe('wide');
    expect(sanitizeChatWidth('huge')).toBe('standard');
    expect(sanitizeChatWidth(undefined)).toBe('standard');
  });

  it('applies the saved width and saves a new choice', async () => {
    store.values.set('ui.chatWidth', 'full');
    const { result } = renderHook(() => useChatWidth());
    await waitFor(() => expect(result.current.chatWidth).toBe('full'));
    expect(document.documentElement.style.getPropertyValue('--wm-chat-max-width')).toBe('none');

    await act(async () => {
      await result.current.setChatWidth('wide');
    });
    expect(store.service.set).toHaveBeenCalledWith('ui.chatWidth', 'wide');
    expect(result.current.chatWidth).toBe('wide');
    expect(document.documentElement.style.getPropertyValue('--wm-chat-max-width')).toBe('960px');
  });

  it('caps the chat column with the variable, falling back to the standard width', () => {
    const css = readFileSync(
      resolve(__dirname, '../../../../packages/desktop/src/renderer/pages/conversation/Messages/messages.css'),
      'utf8'
    );
    expect(css).toContain('max-width: var(--wm-chat-max-width, 760px);');
  });
});
