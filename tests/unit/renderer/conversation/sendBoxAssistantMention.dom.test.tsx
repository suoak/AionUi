/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// 3.0 U7: `@` lists assistants above files; picking one inserts `@Name` and is
// the only thing that grants delegation for this conversation.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

const CONVERSATION_ID = 'delegation-conversation';

const bridge = vi.hoisted(() => ({
  grant: vi.fn().mockResolvedValue(undefined),
  list: vi.fn().mockResolvedValue([]),
  assistants: vi.fn().mockResolvedValue([
    { id: 'writer', name: 'Writer', enabled: true },
    { id: 'off', name: 'Wrong', enabled: false },
  ]),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: { invoke: vi.fn().mockResolvedValue([]) },
      listWorkspaceFiles: { invoke: vi.fn().mockResolvedValue([]) },
    },
    assistants: { list: { invoke: bridge.assistants } },
    delegation: { grant: { invoke: bridge.grant }, list: { invoke: bridge.list } },
  },
}));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: 'var(--color-primary-6)',
    inactiveBorderColor: 'var(--color-border-2)',
    activeShadow: 'none',
  }),
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({
    conversation_id: CONVERSATION_ID,
    workspace: '/w',
    type: 'acp',
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    setSendBoxHandler: vi.fn(),
    domSnippets: [],
    removeDomSnippet: vi.fn(),
    clearDomSnippets: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useMessageList: () => [],
}));

vi.mock('@/renderer/hooks/file/useConversationExport', () => ({
  useConversationExport: () => ({
    isOpen: false,
    showMenu: false,
    step: 'menu',
    filename: '',
    pathPreview: '',
    menuItems: [],
    activeIndex: 0,
    loading: false,
    openExportFlow: vi.fn(),
    closeExportFlow: vi.fn(),
    handleKeyDown: vi.fn(),
    onSelectMenuItem: vi.fn(),
    setActiveIndex: vi.fn(),
    setFilename: vi.fn(),
    submitFilename: vi.fn(),
  }),
}));

vi.mock('@/renderer/components/chat/BtwOverlay/useBtwCommand', () => ({
  useBtwCommand: () => ({
    answer: '',
    question: '',
    isLoading: false,
    isOpen: false,
    ask: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('@/renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => ({ isFileDragging: false, dragHandlers: {} }),
}));

vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({ onPaste: vi.fn(), onFocus: vi.fn() }),
}));

vi.mock('@/renderer/hooks/file/useUploadState', () => ({
  useUploadState: () => ({ isUploading: false }),
}));

vi.mock('@/renderer/hooks/file/useAbortUploadsOnConversationChange', () => ({
  useAbortUploadsOnConversationChange: vi.fn(),
}));

vi.mock('@/renderer/hooks/system/useLiveTranscriptInsertion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/hooks/system/useLiveTranscriptInsertion')>();
  return {
    ...actual,
    useLiveTranscriptInsertion: () => ({ handleLiveTranscript: vi.fn() }),
  };
});

// NOTE: the emitter is intentionally NOT mocked — this test drives the real
// append lane end to end.

vi.mock('@/renderer/components/chat/BtwOverlay', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/SpeechInputButton', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/UploadProgressBar', () => ({ default: () => null }));

import SendBox from '@/renderer/components/chat/SendBox';

const Harness: React.FC<{ onValue: (v: string) => void }> = ({ onValue }) => {
  const [value, setValue] = useState('');
  return (
    <SendBox
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
      onSend={vi.fn().mockResolvedValue(undefined)}
    />
  );
};

const typeAt = (textarea: HTMLTextAreaElement, text: string) => {
  fireEvent.change(textarea, { target: { value: text, selectionStart: text.length, selectionEnd: text.length } });
  textarea.setSelectionRange(text.length, text.length);
  fireEvent.select(textarea);
};

describe('SendBox @ assistants (3.0 U7)', () => {
  it('offers matching enabled assistants and grants only the one picked', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    typeAt(textarea, '@wr');
    const option = await screen.findByTestId('at-menu-assistant-writer');
    expect(screen.queryByTestId('at-menu-assistant-off')).toBeNull();
    expect(bridge.grant).not.toHaveBeenCalled();
    fireEvent.mouseDown(option);
    await waitFor(() => expect(onValue).toHaveBeenLastCalledWith('@Writer '));
    expect(bridge.grant).toHaveBeenCalledWith({ conversation_id: CONVERSATION_ID, assistant_ids: ['writer'] });
  });

  it('does not offer assistants for a path-like query', async () => {
    render(<Harness onValue={vi.fn()} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    typeAt(textarea, '@src/wr');
    await waitFor(() => expect(bridge.assistants).toHaveBeenCalled());
    expect(screen.queryByTestId('at-menu-assistant-writer')).toBeNull();
  });
});
