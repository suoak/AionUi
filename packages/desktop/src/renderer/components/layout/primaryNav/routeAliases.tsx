/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Navigate, Route, useLocation, useParams } from 'react-router-dom';

/**
 * Redirects (replace) from legacy and short paths to the canonical 3.0 routes, so
 * old deep links keep working and history stays clean. Query strings and hashes
 * are carried over so links like `/work-items?task=abc` still open the right drawer.
 */
export const IA_ROUTE_ALIASES: readonly { from: string; to: string }[] = [
  { from: '/sessions', to: '/guid' },
  { from: '/work-items', to: '/tasks' },
  { from: '/work-items/scheduled', to: '/scheduled' },
  { from: '/agent-center', to: '/agents' },
  { from: '/agent-center/new', to: '/agents/new' },
  { from: '/agent-center/squads', to: '/agents/squads' },
  { from: '/automations', to: '/scheduled' },
  { from: '/skills', to: '/skill-evolution' },
  { from: '/skills/new', to: '/skill-evolution/new' },
];

/** Parameterised aliases: `:param` segments are copied (URI-encoded) into `to`. */
export const IA_PARAM_ROUTE_ALIASES: readonly { from: string; to: string }[] = [
  { from: '/work-items/scheduled/:job_id', to: '/scheduled/:job_id' },
  { from: '/agent-center/:id', to: '/agents/:id' },
  { from: '/agent-center/:id/edit', to: '/agents/:id/edit' },
];

const AliasRedirect: React.FC<{ to: string }> = ({ to }) => {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
};

const ParamAliasRedirect: React.FC<{ to: string }> = ({ to }) => {
  const params = useParams();
  const { search, hash } = useLocation();
  const target = to.replace(/:(\w+)/g, (_match, name: string) => encodeURIComponent(params[name] ?? ''));
  return <Navigate to={`${target}${search}${hash}`} replace />;
};

/** `<Route>` elements for every IA alias; spread inside `<Routes>`. */
export function renderIaRouteAliases(): React.ReactElement[] {
  return [
    ...IA_ROUTE_ALIASES.map(({ from, to }) => <Route key={from} path={from} element={<AliasRedirect to={to} />} />),
    ...IA_PARAM_ROUTE_ALIASES.map(({ from, to }) => (
      <Route key={from} path={from} element={<ParamAliasRedirect to={to} />} />
    )),
  ];
}
