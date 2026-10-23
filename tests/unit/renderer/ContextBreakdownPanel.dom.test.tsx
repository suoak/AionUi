/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: 'en-US' },
  }),
}));

// A plain function, not vi.fn: vitest's spy result tracking surfaces a
// rejected return value as a test failure even when the caller handles it.
let impl: (params: unknown) => Promise<unknown> = () => Promise.resolve(null);
const calls: unknown[] = [];
vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      getContextBreakdown: {
        invoke: (params: unknown) => {
          calls.push(params);
          return impl(params);
        },
      },
    },
  },
}));

import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { IContextBreakdown } from '@/common/adapter/ipcBridge';
import { ContextBreakdownPanel, useContextBreakdown } from '@/renderer/components/agent/ContextBreakdownPanel';

const sample: IContextBreakdown = {
  conversation_id: 'c1',
  used: 1000,
  size: 4000,
  source: 'reported',
  segments: [
    { key: 'system_prompt', label: 'System prompt', tokens: 600, source: 'reported' },
    { key: 'tools', label: 'Tool schemas', tokens: 300, source: 'estimated' },
    { key: 'other', label: 'Other', tokens: 100, source: 'reported' },
    { key: 'empty', label: 'Empty', tokens: 0, source: 'reported' },
  ],
};

describe('ContextBreakdownPanel', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('renders one arc and legend row per non-empty segment plus free space', () => {
    const { container, getByTestId } = render(<ContextBreakdownPanel data={sample} />);
    expect(container.querySelectorAll('circle[data-segment]')).toHaveLength(3);
    const text = getByTestId('context-breakdown').textContent ?? '';
    expect(text).toContain('System prompt');
    expect(text).toContain('est.');
    expect(text).toContain('Free');
    expect(text).toContain('3.0K');
    expect(text).not.toContain('Empty');
  });

  it('renders nothing without used tokens', () => {
    const { container } = render(<ContextBreakdownPanel data={{ ...sample, used: null, segments: [] }} />);
    expect(container.innerHTML).toBe('');
  });

  it('fetches only while open', async () => {
    impl = () => Promise.resolve(sample);
    const { result, rerender } = renderHook(({ open }) => useContextBreakdown('c1', open), {
      initialProps: { open: false },
    });
    expect(calls).toHaveLength(0);
    rerender({ open: true });
    await waitFor(() => expect(result.current.kind).toBe('ready'));
    expect(calls).toEqual([{ conversation_id: 'c1' }]);
  });

  it('degrades to unavailable on an older Core (404)', async () => {
    const notFound = new BackendHttpError({
      method: 'GET',
      path: '/api/conversations/c1/context-breakdown',
      status: 404,
      body: '',
    });
    impl = () => Promise.reject(notFound);
    const { result } = renderHook(() => useContextBreakdown('c1', true));
    await waitFor(() => expect(result.current.kind).toBe('unavailable'));
  });
});
