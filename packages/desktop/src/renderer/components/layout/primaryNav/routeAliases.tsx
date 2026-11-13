/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Navigate, Route, useLocation, useParams } from 'react-router-dom';

/**
 * IA-2 — canonical five-entry deep links. Each alias redirects (replace) to the
 * existing page, so legacy routes keep working and history stays clean.
 * Query strings and hashes are carried over so deep links like
 * `/work-items?task=abc` keep opening the right drawer.
 */
export const IA_ROUTE_ALIASES: readonly { from: string; to: string }[] = [
  { from: '/sessions', to: '/guid' },
  { from: '/work-items', to: '/tasks' },
  { from: '/work-items/scheduled', to: '/scheduled' },
  { from: '/agents', to: '/agent-center' },
  { from: '/agents/new', to: '/agent-center/new' },
  { from: '/skills', to: '/skill-evolution' },
  { from: '/skills/new', to: '/skill-evolution/new' },
];

export const IA_SCHEDULED_JOB_ALIAS = '/work-items/scheduled/:job_id';

const AliasRedirect: React.FC<{ to: string }> = ({ to }) => {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
};

export const WorkItemsScheduledRedirect: React.FC = () => {
  const { job_id } = useParams<{ job_id: string }>();
  const { search, hash } = useLocation();
  const base = job_id ? `/scheduled/${encodeURIComponent(job_id)}` : '/scheduled';
  return <Navigate to={`${base}${search}${hash}`} replace />;
};

/** `<Route>` elements for every IA alias; spread inside `<Routes>`. */
export function renderIaRouteAliases(): React.ReactElement[] {
  return [
    ...IA_ROUTE_ALIASES.map(({ from, to }) => <Route key={from} path={from} element={<AliasRedirect to={to} />} />),
    <Route key={IA_SCHEDULED_JOB_ALIAS} path={IA_SCHEDULED_JOB_ALIAS} element={<WorkItemsScheduledRedirect />} />,
  ];
}
