/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn(async () => [] as unknown[]) }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
}));
vi.mock('@/common', () => {
  const proxy: unknown = new Proxy({}, { get: () => ({ invoke }) });
  return {
    ipcBridge: {
      skillEvolution: proxy,
      agentCenter: proxy,
      database: { getUserConversations: { invoke: vi.fn(async () => ({ items: [] })) } },
      conversation: proxy,
    },
  };
});

import SkillEvolutionListPage from '@/renderer/pages/skill-evolution/SkillEvolutionListPage';
import SkillEvolutionCreatePage from '@/renderer/pages/skill-evolution/SkillEvolutionCreatePage';

afterEach(() => {
  cleanup();
  invoke.mockClear();
});

describe('Skill Evolution pages render localized copy (3.0 V10 part 1)', () => {
  it('list page', async () => {
    render(
      <MemoryRouter>
        <SkillEvolutionListPage />
      </MemoryRouter>
    );
    expect(screen.getByText('agent.skillEvolution.page.title')).toBeTruthy();
    expect(screen.getByText('agent.skillEvolution.status.pending_review')).toBeTruthy();
    expect(screen.getByText('agent.skillEvolution.tabs.settings')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('agent.skillEvolution.proposals.empty')).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it('create page', () => {
    render(
      <MemoryRouter>
        <SkillEvolutionCreatePage />
      </MemoryRouter>
    );
    expect(screen.getByText('agent.skillEvolution.create.back')).toBeTruthy();
    expect(screen.getByText('agent.skillEvolution.create.evolve')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
