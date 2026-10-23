import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}));

import ReviewBatchCard from '@/renderer/pages/conversation/Messages/components/ReviewBatchCard';
import { parseReviewBlock } from '@/renderer/pages/conversation/Messages/components/reviewMarker';

const BLOCK = [
  '[[AION_REVIEW batch=b-9 count=2]]',
  'preface',
  '',
  '#1 src/a.ts  L2（新版本）',
  '批注：rename x',
  '',
  '#2 src/b.ts  L3–L5（新版本）',
  '批注：why?',
  '[[/AION_REVIEW]]',
].join('\n');

afterEach(cleanup);

describe('ReviewBatchCard', () => {
  it('shows the note count and notes, and expands to the sent text', () => {
    render(<ReviewBatchCard block={parseReviewBlock(BLOCK)!} />);
    expect(screen.getByText('conversation.reviewBatch.title {"count":2}')).toBeTruthy();
    expect(screen.getByText('rename x')).toBeTruthy();
    expect(screen.getByText('src/b.ts L3–L5（新版本）')).toBeTruthy();
    expect(screen.queryByTestId('review-batch-raw')).toBeNull();

    fireEvent.click(screen.getByText('conversation.reviewBatch.showSent'));
    expect(screen.getByTestId('review-batch-raw').textContent).toBe(BLOCK);
    fireEvent.click(screen.getByText('conversation.reviewBatch.hideSent'));
    expect(screen.queryByTestId('review-batch-raw')).toBeNull();
  });
});
