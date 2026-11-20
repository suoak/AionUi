/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { AUTOMATIONS_TAB_PATHS, useAutomationsTabs } from '@/renderer/pages/cron/useAutomationsTabs';

describe('useAutomationsTabs (U1)', () => {
  beforeEach(() => navigate.mockReset());

  it('exposes Scheduled and Batch tabs with the active key', () => {
    const { result } = renderHook(() => useAutomationsTabs('batch'));
    expect(result.current.tabs.map((tab) => tab.key)).toEqual(['scheduled', 'batch']);
    expect(result.current.tabs[0].label).toBe('common.automations.tabs.scheduled');
    expect(result.current.activeTab).toBe('batch');
  });

  it('navigates to the other tab route and ignores the active or unknown keys', () => {
    const { result } = renderHook(() => useAutomationsTabs('scheduled'));
    result.current.onTabChange('scheduled');
    result.current.onTabChange('nope');
    expect(navigate).not.toHaveBeenCalled();
    result.current.onTabChange('batch');
    expect(navigate).toHaveBeenCalledWith(AUTOMATIONS_TAB_PATHS.batch);
  });
});
