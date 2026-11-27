/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  pathname: '/guid',
  isMobile: false,
  scheduledRendered: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ pathname: mocks.pathname, search: '', hash: '' }),
}));
vi.mock('@renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({ closePreview: vi.fn(), clearPreviewForScope: vi.fn() }),
}));
vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn(), status: 'authenticated' }),
}));
vi.mock('@renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => ({ isMobile: mocks.isMobile }) }));
vi.mock('@renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', setTheme: vi.fn() }),
}));
vi.mock('@renderer/pages/conversation/GroupedHistory', () => ({ default: () => null }));
vi.mock('@renderer/pages/settings/components/SettingsSider', () => ({ default: () => null }));

type EntryProps = { isActive?: boolean; onClick?: () => void };
const { entry } = vi.hoisted(() => ({
  entry: (testId: string) => (props: { isActive?: boolean; onClick?: () => void }) =>
    React.createElement('button', {
      'data-testid': testId,
      'data-active': String(Boolean(props.isActive)),
      onClick: props.onClick,
    }),
}));

vi.mock('@renderer/components/layout/Sider/SiderNav', () => ({
  SiderToolbar: () => null,
  SiderSearchEntry: () => null,
  SiderScheduledEntry: (props: EntryProps) => {
    mocks.scheduledRendered();
    return entry('sider-scheduled')(props);
  },
  SiderAgentsEntry: entry('sider-agents'),
  SiderSkillEvolutionEntry: entry('sider-skills'),
  SiderUsageEntry: entry('sider-usage'),
  SiderInboxEntry: entry('sider-inbox'),
  SiderTasksBoardEntry: entry('sider-tasks'),
  SiderAutomationsEntry: entry('sider-automations'),
}));
vi.mock('@renderer/components/layout/Sider/SiderFooter', () => ({ default: () => null }));
vi.mock('@renderer/components/layout/Sider/TeamSiderSection', () => ({ default: () => null }));
vi.mock('@renderer/components/layout/Sider/FanoutSiderGroup', () => ({ default: () => null }));
vi.mock('@renderer/components/layout/Sider/SiderPluginPanelsGroup', () => ({ default: () => null }));

import Sider from '@renderer/components/layout/Sider';

const active = (testId: string) => screen.getByTestId(testId).dataset.active === 'true';

describe('Sider 3.0 IA navigation (U1)', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.scheduledRendered.mockReset();
    mocks.pathname = '/guid';
    mocks.isMobile = false;
  });
  afterEach(cleanup);

  it('no longer renders a standalone Scheduled entry', () => {
    render(<Sider />);
    expect(screen.queryByTestId('sider-scheduled')).toBeNull();
    expect(mocks.scheduledRendered).not.toHaveBeenCalled();
    expect(screen.getByTestId('sider-tasks')).toBeTruthy();
    expect(screen.getByTestId('sider-automations')).toBeTruthy();
  });

  it('orders the primary entries before secondary ones', () => {
    render(<Sider />);
    const order = ['sider-tasks', 'sider-agents', 'sider-skills', 'sider-automations'];
    const nodes = order.map((id) => screen.getByTestId(id));
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('has no separate Assistants row (3.0 V12; reachable from the command palette)', () => {
    render(<Sider />);
    expect(screen.queryByTestId('sider-assistants')).toBeNull();
  });

  it('moves usage and inbox out of the desktop sider (status bar + titlebar bell)', () => {
    render(<Sider />);
    expect(screen.queryByTestId('sider-usage')).toBeNull();
    expect(screen.queryByTestId('sider-inbox')).toBeNull();
  });

  it('keeps usage and inbox in the mobile sider, which has no status bar or bell', () => {
    mocks.isMobile = true;
    render(<Sider />);
    expect(screen.getByTestId('sider-usage')).toBeTruthy();
    expect(screen.getByTestId('sider-inbox')).toBeTruthy();
  });

  it.each(['/work-items', '/tasks', '/tasks/abc'])('highlights Tasks on %s', (pathname) => {
    mocks.pathname = pathname;
    render(<Sider />);
    expect(active('sider-tasks')).toBe(true);
    expect(active('sider-agents')).toBe(false);
    expect(active('sider-automations')).toBe(false);
  });

  it.each(['/automations', '/scheduled', '/scheduled/job-1', '/batch'])('highlights Automations on %s', (pathname) => {
    mocks.pathname = pathname;
    render(<Sider />);
    expect(active('sider-automations')).toBe(true);
    expect(active('sider-tasks')).toBe(false);
  });

  it.each([
    ['/agents', 'sider-agents'],
    ['/agents/x/edit', 'sider-agents'],
    ['/agent-center/x', 'sider-agents'],
    ['/skills', 'sider-skills'],
    ['/skill-evolution', 'sider-skills'],
  ])('highlights the matching primary entry on %s', (pathname, testId) => {
    mocks.pathname = pathname;
    render(<Sider />);
    expect(active(testId)).toBe(true);
  });

  it('navigates primary entries to canonical paths', () => {
    render(<Sider />);
    fireEvent.click(screen.getByTestId('sider-tasks'));
    fireEvent.click(screen.getByTestId('sider-agents'));
    fireEvent.click(screen.getByTestId('sider-skills'));
    fireEvent.click(screen.getByTestId('sider-automations'));
    expect(mocks.navigate.mock.calls.map((c) => c[0])).toEqual(['/tasks', '/agents', '/skills', '/automations']);
  });
});
