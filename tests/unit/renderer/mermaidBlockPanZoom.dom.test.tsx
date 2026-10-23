/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const renderMock = vi.hoisted(() => vi.fn());

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: renderMock },
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ openPreview: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-syntax-highlighter', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <pre data-testid='mermaid-source'>{children}</pre>,
}));
vi.mock('react-syntax-highlighter/dist/esm/styles/hljs', () => ({ vs: {}, vs2015: {} }));

vi.mock('@arco-design/web-react', () => ({
  Message: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

// icon-park icons render as clickable spans that forward data-testid/title/onClick.
const makeIcon = vi.hoisted(
  () =>
    (name: string) =>
    ({
      ['data-testid']: testId,
      title,
      onClick,
    }: {
      ['data-testid']?: string;
      title?: string;
      onClick?: () => void;
    }) => <span data-icon={name} data-testid={testId} title={title} onClick={onClick} />
);

vi.mock('@icon-park/react', () => ({
  Copy: makeIcon('copy'),
  PreviewOpen: makeIcon('preview-open'),
  ZoomIn: makeIcon('zoom-in'),
  ZoomOut: makeIcon('zoom-out'),
  Refresh: makeIcon('refresh'),
  Close: makeIcon('close'),
}));

import MermaidBlock from '@/renderer/components/Markdown/MermaidBlock';

// Slow CI runners (notably Windows) can exceed the 1s testing-library default
// while mermaid's async render and the Strict Mode remount settle.
const SETTLE = { timeout: 5000 };

const innerOf = (): HTMLElement => screen.getByTestId('mermaid-diagram').firstElementChild as HTMLElement;

/**
 * Resolve the diagram only once the rendered SVG is in place (and, for the
 * pan/zoom viewport, the transform is at rest). Always re-query by test id:
 * a remount replaces the node, so a handle taken earlier can go stale.
 */
async function settledDiagram(panZoom = false): Promise<HTMLElement> {
  await waitFor(() => {
    const diagram = screen.getByTestId('mermaid-diagram');
    expect(diagram.querySelector('svg')).not.toBeNull();
    if (panZoom) expect(innerOf().style.transform).toContain('translate(0px, 0px) scale(1)');
  }, SETTLE);
  return screen.getByTestId('mermaid-diagram');
}

// jsdom lacks the pointer capture API used by the drag handlers.
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'setPointerCapture', {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(Element.prototype, 'hasPointerCapture', {
    value: vi.fn(() => false),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(Element.prototype, 'releasePointerCapture', {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
});

describe('MermaidBlock pan/zoom', () => {
  beforeEach(() => {
    renderMock.mockReset().mockResolvedValue({ svg: '<svg width="120" height="80"></svg>' });
    document.documentElement.setAttribute('data-theme', 'light');
  });

  it('renders a static diagram without zoom controls by default', async () => {
    render(<MermaidBlock code={'graph TD; A-->B'} />);
    const diagram = await settledDiagram();
    // Default path scrolls natively and exposes no zoom controls.
    expect(diagram.style.overflowX).toBe('auto');
    expect(screen.queryByTestId('mermaid-zoom-in')).toBeNull();
    expect(screen.queryByTestId('mermaid-zoom-reset')).toBeNull();
  });

  it('shows zoom controls and applies/resets scale when enablePanZoom is set', async () => {
    render(<MermaidBlock code={'graph TD; A-->B'} enablePanZoom />);
    // Mermaid render + Strict Mode remount can reset transform; wait until stable.
    const diagram = await settledDiagram(true);
    // Pan viewport clips (hidden overflow) instead of native scroll.
    expect(diagram.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByTestId('mermaid-zoom-in'));
    await waitFor(() => expect(innerOf().style.transform).toContain('scale(1.25)'), SETTLE);

    fireEvent.click(screen.getByTestId('mermaid-zoom-out'));
    await waitFor(() => expect(innerOf().style.transform).toContain('scale(1)'), SETTLE);

    fireEvent.click(screen.getByTestId('mermaid-zoom-in'));
    await waitFor(() => expect(innerOf().style.transform).toContain('scale(1.25)'), SETTLE);
    fireEvent.click(screen.getByTestId('mermaid-zoom-reset'));
    await waitFor(() => expect(innerOf().style.transform).toContain('translate(0px, 0px) scale(1)'), SETTLE);
  });

  it('caps narrow diagrams at their natural width so they render 1:1', async () => {
    renderMock.mockResolvedValue({ svg: '<svg viewBox="0 0 100 200" width="100%"></svg>' });
    render(<MermaidBlock code={'graph TD; A-->B'} />);
    const diagram = await settledDiagram();
    expect(diagram.querySelector('svg')?.getAttribute('style')).toContain('max-width: min(100%, 100px)');
  });

  it('caps wide diagrams at the container width', async () => {
    renderMock.mockResolvedValue({ svg: '<svg viewBox="0 0 2000 100" width="100%"></svg>' });
    render(<MermaidBlock code={'graph TD; A-->B'} />);
    const diagram = await settledDiagram();
    expect(diagram.querySelector('svg')?.getAttribute('style')).toContain('max-width: min(100%, 2000px)');
  });

  it('opens the zoom overlay when the static diagram is clicked', async () => {
    render(<MermaidBlock code={'graph TD; A-->B'} />);
    const diagram = await settledDiagram();
    fireEvent.click(diagram);
    expect(await screen.findByTestId('diagram-zoom-overlay', {}, SETTLE)).toBeInTheDocument();
  });

  it('opens the zoom overlay on click without panning when drag-to-pan is enabled', async () => {
    render(<MermaidBlock code={'graph TD; A-->B'} enablePanZoom />);
    const diagram = await settledDiagram(true);

    fireEvent.pointerDown(diagram, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(diagram, { pointerId: 1, clientX: 12, clientY: 11 });
    fireEvent.pointerUp(diagram, { pointerId: 1 });

    expect(await screen.findByTestId('diagram-zoom-overlay', {}, SETTLE)).toBeInTheDocument();
    expect(innerOf().style.transform).toContain('translate(0px, 0px) scale(1)');
  });

  it('pans instead of opening the overlay when the pointer drags past the threshold', async () => {
    render(<MermaidBlock code={'graph TD; A-->B'} enablePanZoom />);
    const diagram = await settledDiagram(true);

    fireEvent.pointerDown(diagram, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(diagram, { pointerId: 1, clientX: 60, clientY: 40 });
    fireEvent.pointerUp(diagram, { pointerId: 1 });

    await waitFor(() => expect(innerOf().style.transform).toContain('translate(50px, 30px)'), SETTLE);
    expect(screen.queryByTestId('mermaid-zoom-overlay')).toBeNull();
  });
});
