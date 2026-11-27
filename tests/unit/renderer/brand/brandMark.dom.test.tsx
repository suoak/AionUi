/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import BrandMark, { MONO_MARK_SRC } from '@/renderer/components/brand/BrandMark';

afterEach(cleanup);

describe('BrandMark', () => {
  it('renders the colour mark at the requested size and is decorative by default', () => {
    render(<BrandMark size={32} data-testid='mark' />);
    const mark = screen.getByTestId('mark');
    expect(mark.getAttribute('data-variant')).toBe('color');
    expect(mark.style.width).toBe('32px');
    expect(mark.querySelector('img')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('exposes its label when one is given', () => {
    render(<BrandMark size={48} label='CSBU WorkMate' />);
    expect(screen.getByAltText('CSBU WorkMate')).toBeTruthy();
  });

  it('keeps the colour mark for the mono variant until a single-colour asset is registered', () => {
    expect(MONO_MARK_SRC).toBeNull();
    render(<BrandMark size={24} variant='mono' data-testid='mark' />);
    expect(screen.getByTestId('mark').getAttribute('data-variant')).toBe('color');
  });
});
