/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import SiderToolbar from '@/renderer/components/layout/Sider/SiderNav/SiderToolbar';

const tooltipProps = { disabled: true } as never;

const renderToolbar = (over: Partial<React.ComponentProps<typeof SiderToolbar>> = {}) => {
  const props = {
    isMobile: false,
    isBatchMode: false,
    collapsed: false,
    siderTooltipProps: tooltipProps,
    onNewChat: vi.fn(),
    onToggleBatchMode: vi.fn(),
    onImportTasks: vi.fn(),
    ...over,
  };
  render(<SiderToolbar {...props} />);
  return props;
};

describe('Sider "New ▾" menu (V3)', () => {
  afterEach(cleanup);

  it('offers new chat, import tasks and batch manage', async () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByTestId('sider-new-menu-trigger'));
    fireEvent.click(await screen.findByTestId('sider-new-menu-import-tasks'));
    expect(props.onImportTasks).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('sider-new-menu-trigger'));
    fireEvent.click(await screen.findByTestId('sider-new-menu-batch-manage'));
    expect(props.onToggleBatchMode).toHaveBeenCalledTimes(1);
  });

  it('shows only the exit toggle while batch mode is on', () => {
    const props = renderToolbar({ isBatchMode: true });
    expect(screen.queryByTestId('sider-new-menu-trigger')).toBeNull();
    fireEvent.click(screen.getByTestId('sider-batch-mode-exit'));
    expect(props.onToggleBatchMode).toHaveBeenCalledTimes(1);
  });
});
