import type { DeckLayout, DeckSlide } from '@/common/types/office/presentation';
import { Button } from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LayoutWireframe from './LayoutWireframe';
import { suggestLayoutAlternatives } from './deckState';

type Props = {
  slide: DeckSlide;
  layouts: DeckLayout[];
  onLayoutChange: (layout: DeckLayout) => void;
};

type Mode = 'side' | 'sequential';

/**
 * P2.6 — side-by-side or sequential wireframe compare of same-role layout candidates.
 * Original WorkMate UX (outline slot labels + chip wireframes); no HTML Dashi.
 */
const CandidateCompare: React.FC<Props> = ({ slide, layouts, onLayoutChange }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('side');
  const [sequentialIndex, setSequentialIndex] = useState(0);

  const compareLayouts = useMemo(() => {
    const itemCount = slide.blocks.filter((candidate) =>
      ['metric', 'list', 'text', 'image', 'chart', 'table'].includes(candidate.type)
    ).length;
    const hasChart = slide.blocks.some((candidate) => candidate.type === 'chart');
    const needsMedia = slide.blocks.some((candidate) => candidate.type === 'image');
    const alternatives = suggestLayoutAlternatives(
      layouts,
      slide.layoutId,
      slide.role,
      4,
      { itemCount, hasChart, needsMedia },
      slide.candidates
    );
    const current = layouts.find((layout) => layout.id === slide.layoutId);
    const rest = alternatives.filter((layout) => layout.id !== slide.layoutId);
    return current ? [current, ...rest].slice(0, 4) : alternatives.slice(0, 4);
  }, [layouts, slide.blocks, slide.candidates, slide.layoutId, slide.role]);

  if (compareLayouts.length < 2) return null;

  const sequentialLayout = compareLayouts[Math.min(sequentialIndex, compareLayouts.length - 1)];

  return (
    <div className='mt-14px' data-testid='presentation-candidate-compare'>
      <div className='flex flex-wrap items-center gap-6px mb-6px'>
        <Button
          size='mini'
          type={open ? 'primary' : 'outline'}
          data-testid='candidate-compare-toggle'
          onClick={() => setOpen((value) => !value)}
        >
          {open ? t('presentation.field.compareHide') : t('presentation.field.compareShow')}
        </Button>
        {open && (
          <>
            <Button
              size='mini'
              type={mode === 'side' ? 'primary' : 'outline'}
              data-testid='candidate-compare-mode-side'
              onClick={() => setMode('side')}
            >
              {t('presentation.field.compareSide')}
            </Button>
            <Button
              size='mini'
              type={mode === 'sequential' ? 'primary' : 'outline'}
              data-testid='candidate-compare-mode-sequential'
              onClick={() => {
                setMode('sequential');
                const idx = compareLayouts.findIndex((layout) => layout.id === slide.layoutId);
                setSequentialIndex(idx >= 0 ? idx : 0);
              }}
            >
              {t('presentation.field.compareSequential')}
            </Button>
          </>
        )}
      </div>
      {open && mode === 'side' && (
        <div className='grid grid-cols-2 gap-6px' data-testid='candidate-compare-side'>
          {compareLayouts.map((layout) => (
            <LayoutWireframe
              key={layout.id}
              layout={layout}
              slide={slide}
              compact
              active={layout.id === slide.layoutId}
              label={t(`presentation.catalog.layout.${layout.id}`, { defaultValue: layout.label })}
              onSelect={() => onLayoutChange(layout)}
            />
          ))}
        </div>
      )}
      {open && mode === 'sequential' && sequentialLayout && (
        <div data-testid='candidate-compare-sequential'>
          <div className='flex items-center justify-between gap-6px mb-6px'>
            <Button
              size='mini'
              type='outline'
              data-testid='candidate-compare-prev'
              disabled={sequentialIndex <= 0}
              onClick={() => setSequentialIndex((value) => Math.max(0, value - 1))}
            >
              ←
            </Button>
            <span className='text-11px text-t-tertiary'>
              {sequentialIndex + 1}/{compareLayouts.length}
            </span>
            <Button
              size='mini'
              type='outline'
              data-testid='candidate-compare-next'
              disabled={sequentialIndex >= compareLayouts.length - 1}
              onClick={() => setSequentialIndex((value) => Math.min(compareLayouts.length - 1, value + 1))}
            >
              →
            </Button>
          </div>
          <LayoutWireframe
            layout={sequentialLayout}
            slide={slide}
            active={sequentialLayout.id === slide.layoutId}
            label={t(`presentation.catalog.layout.${sequentialLayout.id}`, {
              defaultValue: sequentialLayout.label,
            })}
            onSelect={() => onLayoutChange(sequentialLayout)}
          />
          {sequentialLayout.id !== slide.layoutId && (
            <Button
              className='mt-6px'
              size='mini'
              type='primary'
              long
              data-testid='candidate-compare-apply'
              onClick={() => onLayoutChange(sequentialLayout)}
            >
              {t('presentation.field.compareApply')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default CandidateCompare;
