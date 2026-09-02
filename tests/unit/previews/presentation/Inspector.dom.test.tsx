import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeckLayout, DeckSlide } from '@/common/types/office/presentation';
import Inspector from '@/renderer/pages/conversation/Preview/components/PresentationStudio/Inspector';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

const layouts: DeckLayout[] = [
  {
    id: 'comparison',
    role: 'comparison',
    label: 'Comparison',
    slots: [],
    controls: [
      { id: 'balance', type: 'range', label: 'Column balance', defaultValue: 50, min: 35, max: 65, step: 1 },
      { id: 'showInsight', type: 'toggle', label: 'Show insight panel', defaultValue: true },
    ],
  },
  {
    id: 'image-text',
    role: 'content',
    label: 'Image and text',
    slots: [],
    controls: [
      { id: 'mediaSide', type: 'select', label: 'Media side', defaultValue: 'left', options: ['left', 'right'] },
    ],
  },
  { id: 'cover', role: 'cover', label: 'Cover', slots: [], controls: [] },
];

const baseProps = {
  layouts,
  onLayoutChange: vi.fn(),
  onSlideChange: vi.fn(),
  onBlockChange: vi.fn(),
  onImportImage: vi.fn(),
  onUploadImage: vi.fn(),
  onGenerateImage: vi.fn(),
  onSkipMedia: vi.fn(),
};

describe('WorkMate presentation inspector controls', () => {
  it('renders catalog layout controls and writes into slide.controls', () => {
    const slide: DeckSlide = {
      id: 'compare',
      role: 'comparison',
      layoutId: 'comparison',
      title: 'Options',
      blocks: [],
      controls: { balance: 50, showInsight: true },
    };
    const onSlideChange = vi.fn((update: (draft: DeckSlide) => void) => {
      update(slide);
    });

    render(<Inspector {...baseProps} slide={slide} onSlideChange={onSlideChange} />);

    expect(screen.getByTestId('presentation-layout-controls')).toBeInTheDocument();
    expect(screen.getByTestId('layout-control-balance')).toBeInTheDocument();
    expect(screen.getByTestId('layout-control-showInsight')).toBeInTheDocument();

    const insightControl = screen.getByTestId('layout-control-showInsight');
    fireEvent.click(insightControl.querySelector('[role="switch"]')!);
    expect(onSlideChange).toHaveBeenCalled();
    expect(slide.controls).toMatchObject({ showInsight: false });
  });

  it('hides the controls section when the layout has none', () => {
    const slide: DeckSlide = { id: 'cover', role: 'cover', layoutId: 'cover', blocks: [] };
    render(<Inspector {...baseProps} slide={slide} />);
    expect(screen.queryByTestId('presentation-layout-controls')).not.toBeInTheDocument();
  });

  it('shows pending media actions including skip', () => {
    const slide: DeckSlide = {
      id: 'cover',
      role: 'cover',
      layoutId: 'cover',
      blocks: [{ id: 'hero', type: 'image', slot: 'media', assetId: 'hero' }],
    };
    const onSkipMedia = vi.fn();
    render(
      <Inspector
        {...baseProps}
        slide={slide}
        block={slide.blocks[0]}
        asset={{ id: 'hero', path: 'q1.assets/hero.png', type: 'image', status: 'pending' }}
        onSkipMedia={onSkipMedia}
      />
    );

    expect(screen.getByTestId('media-status-pending')).toBeInTheDocument();
    expect(screen.getByTestId('media-skip')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('media-skip'));
    expect(onSkipMedia).toHaveBeenCalledWith(slide.blocks[0]);
  });

  it('shows replace labeling when the asset is ready', () => {
    const slide: DeckSlide = {
      id: 'cover',
      role: 'cover',
      layoutId: 'cover',
      blocks: [{ id: 'hero', type: 'image', slot: 'media', assetId: 'hero' }],
    };
    render(
      <Inspector
        {...baseProps}
        slide={slide}
        block={slide.blocks[0]}
        asset={{ id: 'hero', path: 'q1.assets/hero.png', type: 'image', status: 'ready' }}
      />
    );
    expect(screen.getByTestId('media-status-ready')).toBeInTheDocument();
    expect(screen.getByText('presentation.action.replaceImage')).toBeInTheDocument();
    expect(screen.queryByTestId('media-skip')).not.toBeInTheDocument();
  });
});
