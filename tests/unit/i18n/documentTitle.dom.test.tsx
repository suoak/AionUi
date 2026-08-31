import { describe, expect, it } from 'vitest';

import { titleForPath } from '@/renderer/components/layout/Router';

describe('document title routing', () => {
  const t = (key: 'login.pageTitle') => `translated:${key}`;

  it('uses the localized login title on login routes', () => {
    expect(titleForPath('/login', t)).toBe('translated:login.pageTitle');
  });

  it('resets stale login titles after navigation', () => {
    expect(titleForPath('/guid', t)).toBe('CSBU WorkMate');
    expect(titleForPath('/conversation/example', t)).toBe('CSBU WorkMate');
  });
});
