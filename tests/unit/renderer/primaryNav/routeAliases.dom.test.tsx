/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import {
  IA_PARAM_ROUTE_ALIASES,
  IA_ROUTE_ALIASES,
  renderIaRouteAliases,
} from '@renderer/components/layout/primaryNav/routeAliases';

const Where: React.FC = () => {
  const { pathname, search, hash } = useLocation();
  return <div data-testid='where'>{`${pathname}${search}${hash}`}</div>;
};

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        {renderIaRouteAliases()}
        <Route path='*' element={<Where />} />
      </Routes>
    </MemoryRouter>
  );

describe('3.0 IA route aliases (U1)', () => {
  afterEach(cleanup);

  it.each([
    ['/sessions', '/guid'],
    ['/work-items', '/tasks'],
    ['/work-items/scheduled', '/scheduled'],
    ['/work-items/scheduled/job-42', '/scheduled/job-42'],
    ['/agent-center', '/agents'],
    ['/agent-center/new', '/agents/new'],
    ['/agent-center/squads', '/agents/squads'],
    ['/agent-center/abc', '/agents/abc'],
    ['/agent-center/abc/edit', '/agents/abc/edit'],
    ['/automations', '/scheduled'],
    ['/skills', '/skill-evolution'],
    ['/skills/new', '/skill-evolution/new'],
  ])('redirects %s → %s', (from, to) => {
    renderAt(from);
    expect(screen.getByTestId('where').textContent).toBe(to);
  });

  it('encodes scheduled job ids and preserves query + hash', () => {
    renderAt('/work-items/scheduled/a%20b?tab=runs#top');
    expect(screen.getByTestId('where').textContent).toBe('/scheduled/a%20b?tab=runs#top');
  });

  it('carries deep-link query strings through static aliases', () => {
    renderAt('/work-items?task=deep1');
    expect(screen.getByTestId('where').textContent).toBe('/tasks?task=deep1');
  });

  it('leaves canonical routes untouched', () => {
    renderAt('/tasks');
    expect(screen.getByTestId('where').textContent).toBe('/tasks');
    cleanup();
    renderAt('/agents/abc');
    expect(screen.getByTestId('where').textContent).toBe('/agents/abc');
  });

  it('carries query strings through parameterised agent aliases', () => {
    renderAt('/agent-center/a%20b/edit?tab=skills');
    expect(screen.getByTestId('where').textContent).toBe('/agents/a%20b/edit?tab=skills');
  });

  it('declares unique alias sources that never redirect to another alias', () => {
    const froms = IA_ROUTE_ALIASES.map((a) => a.from);
    expect(new Set(froms).size).toBe(froms.length);
    for (const { to } of IA_ROUTE_ALIASES) expect(froms).not.toContain(to);
    for (const { to } of IA_PARAM_ROUTE_ALIASES) expect(froms).not.toContain(to);
  });
});
