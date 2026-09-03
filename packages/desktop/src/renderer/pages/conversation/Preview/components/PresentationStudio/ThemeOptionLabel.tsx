import type { DeckTheme } from '@/common/types/office/presentation';
import React from 'react';
import { themeStripPalette, themeTokenColor } from './deckState';

type Props = {
  theme: DeckTheme;
  label: string;
  /** compact = select option chip; strip = outline-stage preview band */
  variant?: 'compact' | 'strip';
};

/** CSBU WorkMate catalog theme preview (token bands only — no Dashi assets). */
const ThemeOptionLabel: React.FC<Props> = ({ theme, label, variant = 'compact' }) => {
  const palette = themeStripPalette(theme.tokens);
  if (variant === 'strip') {
    return (
      <span
        className='inline-flex flex-col gap-4px min-w-0 w-full'
        data-testid={`theme-option-${theme.id}`}
        data-variant='strip'
      >
        <span
          className='inline-flex w-full h-28px rounded-4px overflow-hidden border border-border-2'
          aria-hidden
          data-testid={`theme-strip-${theme.id}`}
        >
          <span className='flex-[3]' style={{ backgroundColor: palette.background }} />
          <span className='flex-[2]' style={{ backgroundColor: palette.surface }} />
          <span className='flex-1' style={{ backgroundColor: palette.accent }} />
          <span className='w-10px flex-shrink-0' style={{ backgroundColor: palette.text }} />
        </span>
        <span className='truncate text-12px'>{label}</span>
      </span>
    );
  }

  const background = themeTokenColor(theme.tokens, 'background') ?? palette.background;
  const accent = themeTokenColor(theme.tokens, 'accent') ?? palette.accent;
  return (
    <span className='inline-flex items-center gap-8px min-w-0' data-testid={`theme-option-${theme.id}`}>
      <span
        className='inline-flex w-28px h-14px rounded-3px overflow-hidden border border-border-2 flex-shrink-0'
        aria-hidden
      >
        <span className='flex-[2]' style={{ backgroundColor: background }} />
        <span className='flex-1' style={{ backgroundColor: palette.surface }} />
        <span className='w-6px flex-shrink-0' style={{ backgroundColor: accent }} />
      </span>
      <span className='truncate'>{label}</span>
    </span>
  );
};

export default ThemeOptionLabel;
