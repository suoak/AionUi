/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null }),
}));
vi.mock('@/renderer/utils/model/agentLogo', () => ({ useAgentLogos: () => ({}) }));
vi.mock('@/renderer/pages/cron', () => ({ CronJobIndicator: () => null }));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => ({ isMobile: false }) }));
vi.mock('@/renderer/pages/conversation/utils/conversationAssistantIdentity', () => ({
  resolveConversationLeadingMark: () => ({ kind: 'default' }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import ConversationRow from '@/renderer/pages/conversation/GroupedHistory/ConversationRow';
import type { ConversationRowProps } from '@/renderer/pages/conversation/GroupedHistory/types';

const conversation = {
  id: 'conv-1',
  name: 'Chat',
  type: 'acp',
  created_at: 1,
  modified_at: 1,
  extra: {},
} as unknown as TChatConversation;

const baseProps: ConversationRowProps = {
  conversation,
  isGenerating: false,
  isWaitingConfirmation: false,
  hasUnread: false,
  isManualUnread: false,
  collapsed: false,
  tooltipEnabled: false,
  batchMode: false,
  checked: false,
  selected: false,
  menuVisible: false,
  onToggleChecked: vi.fn(),
  onConversationClick: vi.fn(),
  onOpenMenu: vi.fn(),
  onMenuVisibleChange: vi.fn(),
  onEditStart: vi.fn(),
  onCreateCronTask: vi.fn(),
  onArchive: vi.fn(),
  onTogglePin: vi.fn(),
  onToggleManualUnread: vi.fn(),
  getJobStatus: () => 'none',
};

const renderRow = (props: Partial<ConversationRowProps>) => render(<ConversationRow {...baseProps} {...props} />);

describe('ConversationRow leading icon', () => {
  it('shows the waiting-confirmation icon (not the spinner) when waiting takes precedence over generating', () => {
    renderRow({ isWaitingConfirmation: true, isGenerating: true });
    expect(screen.getByTestId('conversation-waiting-confirmation-conv-1')).toBeInTheDocument();
    expect(
      screen.getByTestId('conversation-waiting-confirmation-conv-1').querySelector('[data-status]')
    ).toHaveAttribute('data-status', 'needsYou');
    expect(screen.queryByTestId('conversation-working-conv-1')).toBeNull();
  });

  it('shows the generating spinner when generating but not waiting', () => {
    renderRow({ isWaitingConfirmation: false, isGenerating: true });
    expect(screen.queryByTestId('conversation-waiting-confirmation-conv-1')).toBeNull();
    expect(screen.getByTestId('conversation-working-conv-1').querySelector('[data-status]')).toHaveAttribute(
      'data-status',
      'working'
    );
  });

  it('shows neither the waiting icon nor the spinner when idle', () => {
    renderRow({ isWaitingConfirmation: false, isGenerating: false });
    expect(screen.queryByTestId('conversation-waiting-confirmation-conv-1')).toBeNull();
    expect(screen.queryByTestId('conversation-working-conv-1')).toBeNull();
  });

  it('renders unread rows bold instead of with a badge', () => {
    const { container } = renderRow({ hasUnread: true });
    const name = container.querySelector('.chat-history__item-name');
    expect(name).toHaveAttribute('data-unread', 'true');
    expect(name?.className).toContain('font-700');
  });

  it('drops the unread emphasis while the row is generating', () => {
    const { container } = renderRow({ hasUnread: true, isGenerating: true });
    expect(container.querySelector('.chat-history__item-name')).not.toHaveAttribute('data-unread');
  });

  it('does not show the waiting icon in batch mode (selection UI takes over)', () => {
    renderRow({ isWaitingConfirmation: true, batchMode: true });
    expect(screen.queryByTestId('conversation-waiting-confirmation-conv-1')).toBeNull();
  });
});
