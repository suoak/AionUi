import type { DeckLayout, DeckSlide } from '@/common/types/office/presentation';
import React, { useMemo } from 'react';
import { resolveLayoutSlots } from './deckState';

type Props = {
  layout: DeckLayout;
  slide: DeckSlide;
  label: string;
  active?: boolean;
  onSelect?: () => void;
  compact?: boolean;
};

/**
 * Lightweight outline wireframe for layout candidate compare.
 * Uses Studio packing (resolveLayoutSlots) — no HTML Dashi / screenshot path.
 */
const LayoutWireframe: React.FC<Props> = ({ layout, slide, label, active, onSelect, compact }) => {
  const slots = useMemo(() => resolveLayoutSlots(layout, slide), [layout, slide]);
  const className = `block text-left w-full rounded-6px border overflow-hidden bg-bg-1 ${
    active ? 'border-primary ring-1 ring-primary' : 'border-border-2'
  } ${onSelect ? 'hover:border-primary cursor-pointer' : ''}`;

  const body = (
    <>
      <div className='relative w-full bg-bg-2 aspect-video' style={{ minHeight: compact ? 64 : 88 }}>
        {slots.map((slot) => (
          <div
            key={slot.id}
            className='absolute border border-dashed border-t-secondary/60 bg-bg-1/80 overflow-hidden'
            style={{
              left: `${slot.x * 100}%`,
              top: `${slot.y * 100}%`,
              width: `${slot.width * 100}%`,
              height: `${slot.height * 100}%`,
            }}
            title={slot.id}
          >
            <span className='block px-2px text-9px leading-tight text-t-tertiary truncate'>{slot.id}</span>
          </div>
        ))}
      </div>
      <div className='px-6px py-4px text-11px text-t-secondary truncate' title={label}>
        {active ? '● ' : ''}
        {label}
      </div>
    </>
  );

  if (onSelect) {
    return (
      <button
        type='button'
        className={className}
        data-testid={`layout-wireframe-${layout.id}`}
        aria-pressed={Boolean(active)}
        onClick={onSelect}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={className} data-testid={`layout-wireframe-${layout.id}`}>
      {body}
    </div>
  );
};

export default LayoutWireframe;
