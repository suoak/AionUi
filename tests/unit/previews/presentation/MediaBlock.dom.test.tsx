import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: { fs: { readContent: { invoke: vi.fn() } } },
}));

import { ipcBridge } from '@/common';
import MediaBlock from '@/renderer/pages/conversation/Preview/components/PresentationStudio/MediaBlock';

describe('WorkMate presentation media block', () => {
  beforeEach(() => {
    vi.mocked(ipcBridge.fs.readContent.invoke).mockReset();
  });

  it('loads a ready project asset through ChatFileRef data-url I/O', async () => {
    vi.mocked(ipcBridge.fs.readContent.invoke).mockResolvedValue('data:image/png;base64,aGVybw==');
    render(
      <MediaBlock
        asset={{ id: 'hero', path: 'q1.assets/hero.png', type: 'image', status: 'ready', alt: 'Hero' }}
        deckRef={{ kind: 'project', pe_id: 'pe-1', relative_path: 'reports/q1.workmate-deck.json' }}
        fallback='hero'
      />
    );

    expect(await screen.findByRole('img', { name: 'Hero' })).toHaveAttribute('src', 'data:image/png;base64,aGVybw==');
    expect(ipcBridge.fs.readContent.invoke).toHaveBeenCalledWith({
      file: { kind: 'project', pe_id: 'pe-1', relative_path: 'reports/q1.assets/hero.png' },
      encoding: 'dataurl',
    });
  });

  it('keeps the semantic fallback when media loading fails', async () => {
    vi.mocked(ipcBridge.fs.readContent.invoke).mockRejectedValue(new Error('missing'));
    render(
      <MediaBlock
        asset={{ id: 'hero', path: 'q1.assets/hero.png', type: 'image', status: 'ready' }}
        deckRef={{ kind: 'project', pe_id: 'pe-1', relative_path: 'q1.workmate-deck.json' }}
        fallback='hero fallback'
      />
    );

    await waitFor(() => expect(ipcBridge.fs.readContent.invoke).toHaveBeenCalledOnce());
    expect(screen.getByText('hero fallback')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
