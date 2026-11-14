/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

import AgentWorkflowTemplatePicker from '@/renderer/pages/agent-center/AgentWorkflowTemplatePicker';

describe('AgentWorkflowTemplatePicker', () => {
  afterEach(cleanup);

  it('groups Office/Deck templates first with their file type tag', () => {
    render(<AgentWorkflowTemplatePicker onSelect={vi.fn()} />);
    const groups = Array.from(document.querySelectorAll('[data-testid^="agent-template-group-"]')).map(
      (n) => (n as HTMLElement).dataset.testid
    );
    expect(groups).toEqual(['agent-template-group-office', 'agent-template-group-engineering']);

    const office = screen.getByTestId('agent-template-group-office');
    expect(within(office).getByText('agent.agentCenter.templates.categories.office')).toBeTruthy();
    expect(within(office).getByTestId('agent-template-executiveDeck').textContent).toContain('.pptx');
    expect(within(office).getByTestId('agent-template-officeBrief').textContent).toContain('.docx');
    expect(within(office).getByTestId('agent-template-spreadsheetReport').textContent).toContain('.xlsx');
    expect(within(office).queryByTestId('agent-template-codeReview')).toBeNull();

    const engineering = screen.getByTestId('agent-template-group-engineering');
    expect(within(engineering).getAllByRole('button')).toHaveLength(6);
    expect(within(engineering).getByTestId('agent-template-codeReview').textContent).not.toMatch(/\.(pptx|docx|xlsx)/);
  });

  it('hands the chosen template, with both starters, to the wizard', () => {
    const onSelect = vi.fn();
    render(<AgentWorkflowTemplatePicker onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('agent-template-spreadsheetReport'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'spreadsheetReport',
        deliverable: 'xlsx',
        outputFormat: 'markdown',
        starters: [
          'agent.agentCenter.templates.spreadsheetReport.starter',
          'agent.agentCenter.templates.spreadsheetReport.starterRevise',
        ],
      })
    );
  });
});
