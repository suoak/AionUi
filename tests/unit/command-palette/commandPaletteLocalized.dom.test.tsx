/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ZH: Record<string, string> = {
  'common.commandPalette.commands.newChat': '新会话',
  'common.primaryNav.tasks': '任务',
  'common.commandPalette.commands.settings': '设置',
};

vi.mock('@/common', () => ({ ipcBridge: { extensions: { invokeCommand: { invoke: vi.fn() } } } }));
vi.mock('@/renderer/hooks/file/usePreviewLauncher', () => ({
  usePreviewLauncher: () => ({ launchPreview: vi.fn(), loading: false, errorKind: null }),
}));
vi.mock('@/renderer/hooks/context/ConversationContext', () => ({ useConversationContextSafe: () => null }));
vi.mock('@/renderer/hooks/system/ExtensionPanelSessionContext', () => ({
  useExtensionPanelSession: () => ({ openPanel: vi.fn() }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => ZH[key] ?? opts?.defaultValue ?? key,
    i18n: { language: 'zh-CN' },
  }),
}));
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

import CommandPalette from '@/renderer/components/command-palette/CommandPalette';
import { STATIC_PALETTE_COMMANDS } from '@/renderer/components/command-palette/commandRegistry';

afterEach(cleanup);

describe('command palette localization', () => {
  it('every static command carries a title key', () => {
    expect(STATIC_PALETTE_COMMANDS.filter((cmd) => !cmd.titleKey).map((cmd) => cmd.id)).toEqual([]);
  });

  it('shows localized titles and never a raw route', () => {
    render(<CommandPalette open onClose={() => {}} dynamic={false} />);
    const newChat = screen.getByTestId('command-palette-item-nav.new-chat');
    expect(newChat.textContent).toBe('新会话');
    expect(screen.getByTestId('command-palette-item-nav.primary.tasks').textContent).toBe('任务');
    expect(document.body.textContent).not.toContain('/guid');
    expect(document.body.textContent).not.toContain('/settings');
  });

  it('finds a row by its localized title and by its English title', () => {
    render(<CommandPalette open onClose={() => {}} dynamic={false} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '设置' } });
    expect(screen.getByTestId('command-palette-item-nav.settings')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'new chat' } });
    expect(screen.getByTestId('command-palette-item-nav.new-chat')).toBeTruthy();
  });
});
