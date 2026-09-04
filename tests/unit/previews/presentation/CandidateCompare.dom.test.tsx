import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeckLayout, DeckSlide } from '@/common/types/office/presentation';
import CandidateCompare from '@/renderer/pages/conversation/Preview/components/PresentationStudio/CandidateCompare';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

const layouts: DeckLayout[] = [
  {
    id: 'metrics',
    role: 'metrics',
    label: 'Metrics',
    slots: [
      { id: 'title', x: 0.06, y: 0.05, width: 0.88, height: 0.12, accepts: ['text'] },
      { id: 'metric1', x: 0.06, y: 0.25, width: 0.28, height: 0.5, accepts: ['metric'] },
      { id: 'metric2', x: 0.36, y: 0.25, width: 0.28, height: 0.5, accepts: ['metric'] },
      { id: 'metric3', x: 0.66, y: 0.25, width: 0.28, height: 0.5, accepts: ['metric'] },
    ],
    controls: [{ id: 'moduleCount', type: 'range', label: 'Modules', defaultValue: 3, min: 2, max: 3, step: 1 }],
  },
  {
    id: 'kpi-trio',
    role: 'metrics',
    label: 'KPI trio',
    slots: [
      { id: 'title', x: 0.06, y: 0.05, width: 0.88, height: 0.12, accepts: ['text'] },
      { id: 'metric1', x: 0.06, y: 0.3, width: 0.28, height: 0.4, accepts: ['metric'] },
      { id: 'metric2', x: 0.36, y: 0.3, width: 0.28, height: 0.4, accepts: ['metric'] },
      { id: 'metric3', x: 0.66, y: 0.3, width: 0.28, height: 0.4, accepts: ['metric'] },
    ],
    controls: [],
  },
  {
    id: 'metrics-row-4',
    role: 'metrics',
    label: 'Metrics row 4',
    slots: [
      { id: 'title', x: 0.06, y: 0.05, width: 0.88, height: 0.1, accepts: ['text'] },
      { id: 'metric1', x: 0.04, y: 0.25, width: 0.22, height: 0.5, accepts: ['metric'] },
      { id: 'metric2', x: 0.28, y: 0.25, width: 0.22, height: 0.5, accepts: ['metric'] },
      { id: 'metric3', x: 0.52, y: 0.25, width: 0.22, height: 0.5, accepts: ['metric'] },
      { id: 'metric4', x: 0.76, y: 0.25, width: 0.2, height: 0.5, accepts: ['metric'] },
    ],
    controls: [],
  },
];

const slide: DeckSlide = {
  id: 's1',
  role: 'metrics',
  layoutId: 'metrics',
  title: 'KPIs',
  blocks: [
    { id: 'm1', type: 'metric', slot: 'metric1', value: '12' },
    { id: 'm2', type: 'metric', slot: 'metric2', value: '34' },
  ],
  candidates: ['kpi-trio', 'metrics-row-4'],
};

describe('CandidateCompare wireframe (P2.6)', () => {
  it('toggles side-by-side wireframes and applies a layout', () => {
    const onLayoutChange = vi.fn();
    render(<CandidateCompare slide={slide} layouts={layouts} onLayoutChange={onLayoutChange} />);

    expect(screen.getByTestId('presentation-candidate-compare')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('candidate-compare-toggle'));
    expect(screen.getByTestId('candidate-compare-side')).toBeInTheDocument();
    expect(screen.getByTestId('layout-wireframe-metrics')).toBeInTheDocument();
    expect(screen.getByTestId('layout-wireframe-kpi-trio')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('layout-wireframe-kpi-trio'));
    expect(onLayoutChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'kpi-trio' }));
  });

  it('supports sequential flip-through', () => {
    const onLayoutChange = vi.fn();
    render(<CandidateCompare slide={slide} layouts={layouts} onLayoutChange={onLayoutChange} />);
    fireEvent.click(screen.getByTestId('candidate-compare-toggle'));
    fireEvent.click(screen.getByTestId('candidate-compare-mode-sequential'));
    expect(screen.getByTestId('candidate-compare-sequential')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('candidate-compare-next'));
    fireEvent.click(screen.getByTestId('candidate-compare-apply'));
    expect(onLayoutChange).toHaveBeenCalled();
  });
});
