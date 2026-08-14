/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import AppErrorBoundary from '@/renderer/utils/ui/AppErrorBoundary';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

const Boom: React.FC = () => {
  throw new Error('boom');
};

describe('AppErrorBoundary', () => {
  it('keeps the app shell visible when a child render throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>
    );

    expect(screen.getByTestId('app-error-boundary')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();

    consoleError.mockRestore();
  });
});
