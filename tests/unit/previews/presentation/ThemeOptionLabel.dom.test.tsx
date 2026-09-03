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
          tokens: { background: 'F7F8FA', surface: 'FFFFFF', accent: '246BFD', text: '172033' },
        }}
        label='Business Light'
      />
    );

    const option = screen.getByTestId('theme-option-business-light');
    expect(option).toHaveTextContent('Business Light');
    expect(option.querySelector('[aria-hidden="true"]')).toBeTruthy();
    const chips = option.querySelector('[aria-hidden="true"]')?.children;
    expect(chips?.[0]).toHaveStyle({ backgroundColor: '#F7F8FA' });
    expect(chips?.[2]).toHaveStyle({ backgroundColor: '#246BFD' });
  });

  it('renders a multi-band CSBU WorkMate theme strip for outline picking', () => {
    render(
      <ThemeOptionLabel
        variant='strip'
        theme={{
          id: 'boardroom-navy',
          label: 'Boardroom Navy',
          tokens: { background: '0B1220', surface: '152238', accent: 'C4A35A', text: 'F8FAFC' },
        }}
        label='Boardroom Navy'
      />
    );

    const strip = screen.getByTestId('theme-strip-boardroom-navy');
    expect(strip.children[0]).toHaveStyle({ backgroundColor: '#0B1220' });
    expect(strip.children[1]).toHaveStyle({ backgroundColor: '#152238' });
    expect(strip.children[2]).toHaveStyle({ backgroundColor: '#C4A35A' });
    expect(strip.children[3]).toHaveStyle({ backgroundColor: '#F8FAFC' });
    expect(screen.getByTestId('theme-option-boardroom-navy')).toHaveAttribute('data-variant', 'strip');
  });
});
