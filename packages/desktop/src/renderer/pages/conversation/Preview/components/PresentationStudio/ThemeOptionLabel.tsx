import type { DeckTheme } from '@/common/types/office/presentation';
import React from 'react';
import { themeTokenColor } from './deckState';

type Props = {
  theme: DeckTheme;
  label: string;
};

/** Compact catalog theme label with background/accent swatch (no Dashi assets). */
const ThemeOptionLabel: React.FC<Props> = ({ theme, label }) => {
  const background = themeTokenColor(theme.tokens, 'background') ?? '#D0D5DD';
  const accent = themeTokenColor(theme.tokens, 'accent') ?? '#667085';
  return (
    <span className='inline-flex items-center gap-8px min-w-0' data-testid={`theme-option-${theme.id}`}>
      <span
        className='inline-flex w-18px h-14px rounded-3px overflow-hidden border border-border-2 flex-shrink-0'
        aria-hidden
      >
        <span className='flex-1' style={{ backgroundColor: background }} />
        <span className='w-6px flex-shrink-0' style={{ backgroundColor: accent }} />
      </span>
      <span className='truncate'>{label}</span>
    </span>
  );
};

export default ThemeOptionLabel;
