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
vi.mock('@renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => ({ isMobile: false }) }));
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
  SiderAgentCenterEntry: entry('sider-agents'),
  SiderSkillEvolutionEntry: entry('sider-skills'),
  SiderAssistantEntry: entry('sider-assistants'),
  SiderUsageEntry: entry('sider-usage'),
  SiderInboxEntry: () => null,
  SiderTasksBoardEntry: entry('sider-work-items'),
  SiderBatchEntry: entry('sider-batch'),
}));
vi.mock('@renderer/components/layout/Sider/SiderFooter', () => ({ default: () => null }));
vi.mock('@renderer/components/layout/Sider/TeamSiderSection', () => ({ default: () => null }));
vi.mock('@renderer/components/layout/Sider/FanoutSiderGroup', () => ({ default: () => null }));
vi.mock('@renderer/components/layout/Sider/SiderPluginPanelsGroup', () => ({ default: () => null }));

import Sider from '@renderer/components/layout/Sider';

const active = (testId: string) => screen.getByTestId(testId).dataset.active === 'true';

describe('Sider IA-2/IA-3 navigation', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.scheduledRendered.mockReset();
    mocks.pathname = '/guid';
  });
  afterEach(cleanup);

  it('no longer renders a standalone Scheduled entry', () => {
    render(<Sider />);
    expect(screen.queryByTestId('sider-scheduled')).toBeNull();
    expect(mocks.scheduledRendered).not.toHaveBeenCalled();
    expect(screen.getByTestId('sider-work-items')).toBeTruthy();
  });

  it.each(['/work-items', '/work-items/scheduled', '/tasks', '/tasks/abc', '/scheduled', '/scheduled/job-1'])(
    'highlights Work items on %s',
    (pathname) => {
      mocks.pathname = pathname;
      render(<Sider />);
      expect(active('sider-work-items')).toBe(true);
      expect(active('sider-agents')).toBe(false);
      expect(active('sider-batch')).toBe(false);
    }
  );

  it('does not highlight Work items elsewhere', () => {
    mocks.pathname = '/batch';
    render(<Sider />);
    expect(active('sider-work-items')).toBe(false);
    expect(active('sider-batch')).toBe(true);
  });

  it.each([
    ['/agents', 'sider-agents'],
    ['/agent-center/x', 'sider-agents'],
    ['/skills', 'sider-skills'],
    ['/skill-evolution', 'sider-skills'],
  ])('highlights the matching primary entry on %s', (pathname, testId) => {
    mocks.pathname = pathname;
    render(<Sider />);
    expect(active(testId)).toBe(true);
  });

  it('navigates primary entries to canonical alias paths', () => {
    render(<Sider />);
    fireEvent.click(screen.getByTestId('sider-work-items'));
    fireEvent.click(screen.getByTestId('sider-agents'));
    fireEvent.click(screen.getByTestId('sider-skills'));
    expect(mocks.navigate.mock.calls.map((c) => c[0])).toEqual(['/work-items', '/agents', '/skills']);
  });
});
