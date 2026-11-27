/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SiderTasksBoardEntry from '@/renderer/components/layout/Sider/SiderNav/SiderTasksBoardEntry';

// The needs-you badge has its own test (tests/unit/tasks/siderTasksNeedsYou); here it
// must not open a real board fetch / WebSocket that logs after the file tears down.
vi.mock('@/renderer/pages/tasks/useNeedsYouCount', () => ({ useNeedsYouCount: () => 0 }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('SiderTasksBoardEntry', () => {
  afterEach(() => cleanup());

  it('renders the label when expanded and fires onClick', () => {
    const onClick = vi.fn();
    render(
      <SiderTasksBoardEntry
        isMobile={false}
        isActive={false}
        collapsed={false}
        siderTooltipProps={{}}
        onClick={onClick}
      />
    );
    expect(screen.getByText('common.primaryNav.tasks')).toBeTruthy();
    fireEvent.click(screen.getByTestId('sider-tasks-board-entry'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('marks the active state and stays clickable when collapsed', () => {
    const onClick = vi.fn();
    render(<SiderTasksBoardEntry isMobile={false} isActive collapsed siderTooltipProps={{}} onClick={onClick} />);
    const entry = screen.getByTestId('sider-tasks-board-entry');
    expect(entry.className).toContain('bg-fill-3');
    expect(screen.queryByText('common.primaryNav.tasks')).toBeNull();
    fireEvent.click(entry);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
