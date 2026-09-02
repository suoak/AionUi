/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openBrowserTabMock = vi.hoisted(() => vi.fn());
const openExternalUrlMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const configGetMock = vi.hoisted(() => vi.fn());

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: (...args: unknown[]) => configGetMock(...args),
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: (...args: unknown[]) => openExternalUrlMock(...args),
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  useOptionalPreviewContext: () => ({
    openBrowserTab: openBrowserTabMock,
  }),
}));

vi.mock('@/renderer/components/Markdown/ShadowView', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/Markdown/CodeBlock', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <code>{children}</code>,
}));

vi.mock('@/renderer/utils/chat/latexDelimiters', () => ({
  convertLatexDelimiters: (text: string) => text,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  Message: { success: vi.fn(), error: vi.fn() },
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Download: () => <span data-testid='download-icon' />,
}));

import MarkdownView from '@/renderer/components/Markdown';

describe('MarkdownView chat http link preference', () => {
  beforeEach(() => {
    openBrowserTabMock.mockClear();
    openExternalUrlMock.mockClear();
    configGetMock.mockReset();
  });

  it('opens http links in the in-app preview tab when preference is off (default)', () => {
    configGetMock.mockReturnValue(undefined);

    render(<MarkdownView>{'[docs](https://example.com/docs)'}</MarkdownView>);

    fireEvent.click(screen.getByRole('link', { name: 'docs' }));

    expect(openBrowserTabMock).toHaveBeenCalledTimes(1);
    expect(openBrowserTabMock).toHaveBeenCalledWith('https://example.com/docs');
    expect(openExternalUrlMock).not.toHaveBeenCalled();
  });

  it('opens http links in the system browser when preference is on', () => {
    configGetMock.mockImplementation((key: string) =>
      key === 'openChatLinksInDefaultBrowser' ? true : undefined
    );

    render(<MarkdownView>{'[docs](https://example.com/docs)'}</MarkdownView>);

    fireEvent.click(screen.getByRole('link', { name: 'docs' }));

    expect(openExternalUrlMock).toHaveBeenCalledTimes(1);
    expect(openExternalUrlMock).toHaveBeenCalledWith(expect.stringContaining('https://example.com/docs'));
    expect(openBrowserTabMock).not.toHaveBeenCalled();
  });
});
