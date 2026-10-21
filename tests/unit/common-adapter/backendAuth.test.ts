/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';

import { getBackendAuthHeaders, setBackendAuthHeadersProvider } from '@/common/adapter/backendAuth';

describe('backendAuth', () => {
  afterEach(() => setBackendAuthHeadersProvider(undefined));

  it('returns the provider headers in the main process', () => {
    setBackendAuthHeadersProvider(() => ({ 'x-aionui-local-secret': 'abc' }));
    expect(getBackendAuthHeaders()).toEqual({ 'x-aionui-local-secret': 'abc' });
  });

  it('is empty without a provider or when the provider throws', () => {
    expect(getBackendAuthHeaders()).toEqual({});
    setBackendAuthHeadersProvider(() => {
      throw new Error('boom');
    });
    expect(getBackendAuthHeaders()).toEqual({});
  });
});
