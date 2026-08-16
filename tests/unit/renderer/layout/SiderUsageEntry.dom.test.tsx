/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/common/config/storageKeys';
import { createEmptyUsageLedger, writeUsageLedger } from '@/renderer/utils/chat/tokenUsageLedger';
import SiderUsageEntry from '@/renderer/components/layout/Sider/SiderNav/SiderUsageEntry';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options && typeof options === 'object') {
        return Object.entries(options)
          .filter(([name]) => name !== 'defaultValue')
          .reduce((acc, [name, value]) => acc.replaceAll(`{{${name}}}`, String(value)), key);
      }
      return key;
    },
  }),
}));

describe('SiderUsageEntry', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.TOKEN_USAGE_LEDGER);
  });

  it('shows today spend and fires onClick', () => {
    writeUsageLedger({
      ...createEmptyUsageLedger(),
      events: [
        {
          id: 'e1',
          recorded_at: Date.now(),
          conversation_id: 'conv-1',
          fingerprint: 'turn:1',
          backend: 'aionrs',
          input_tokens: 1200,
          output_tokens: 300,
          thought_tokens: 0,
          cached_read_tokens: 0,
          cached_write_tokens: 0,
          cost_delta: 0,
          source: 'aionrs',
        },
      ],
    });

    const onClick = vi.fn();
    render(
      <SiderUsageEntry
        isMobile={false}
        isActive={false}
        collapsed={false}
        siderTooltipProps={{}}
        onClick={onClick}
      />
    );

    expect(screen.getByTestId('sider-usage-today').textContent).toBe('1.5K');
    fireEvent.click(screen.getByTestId('sider-usage-entry'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('still offers the usage entry when nothing has been spent today', () => {
    render(
      <SiderUsageEntry
        isMobile={false}
        isActive={false}
        collapsed={false}
        siderTooltipProps={{}}
        onClick={vi.fn()}
      />
    );

    expect(screen.getByTestId('sider-usage-today').textContent).toBe('0');
  });
});
