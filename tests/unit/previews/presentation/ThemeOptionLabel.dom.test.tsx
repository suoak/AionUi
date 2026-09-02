import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ThemeOptionLabel from '@/renderer/pages/conversation/Preview/components/PresentationStudio/ThemeOptionLabel';

describe('WorkMate presentation theme option label', () => {
  it('shows the theme label with background and accent swatches', () => {
    render(
      <ThemeOptionLabel
        theme={{
          id: 'business-light',
          label: 'Business Light',
          tokens: { background: 'F7F8FA', accent: '246BFD' },
        }}
        label='Business Light'
      />
    );

    const option = screen.getByTestId('theme-option-business-light');
    expect(option).toHaveTextContent('Business Light');
    const swatches = option.querySelectorAll('span span');
    // outer swatch container + two color chips
    expect(option.querySelector('[aria-hidden="true"]')).toBeTruthy();
    const chips = option.querySelector('[aria-hidden="true"]')?.children;
    expect(chips?.[0]).toHaveStyle({ backgroundColor: '#F7F8FA' });
    expect(chips?.[1]).toHaveStyle({ backgroundColor: '#246BFD' });
  });
});
