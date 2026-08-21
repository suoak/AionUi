import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import CodeEditor from '@/renderer/pages/conversation/Preview/components/editors/CodeEditor';

afterEach(() => vi.clearAllMocks());

describe('CodeEditor', () => {
  it('renders a CodeMirror editor with the given value', () => {
    const { container } = render(<CodeEditor value={'const a = 1;'} onChange={() => {}} language='javascript' />);
    expect(container.querySelector('.cm-editor')).not.toBeNull();
    expect(container.textContent).toContain('const a = 1;');
  });

  it('renders read-only editor without crashing', () => {
    const { container } = render(<CodeEditor value={'x'} onChange={() => {}} readOnly />);
    expect(container.querySelector('.cm-editor')).not.toBeNull();
  });

  it('shows the AI-writing badge when content grows externally', () => {
    const { container, rerender } = render(<CodeEditor value={'a'} onChange={() => {}} />);
    rerender(<CodeEditor value={'a much longer streamed body of content'} onChange={() => {}} />);
    expect(container.textContent).toContain('preview.aiWriting');
  });

  it('opens UTF-16-as-UTF-8 JSON without crashing the editor', () => {
    const utf16AsUtf8 = '{\0"\0o\0k\0"\0:\0t\0r\0u\0e\0}';
    const { container } = render(
      <CodeEditor value={utf16AsUtf8} onChange={() => {}} language='json' fileName='output.json' />
    );
    expect(container.querySelector('.cm-editor')).not.toBeNull();
    expect(container.textContent).toContain('{"ok":true}');
  });
});
