/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Typography } from '@arco-design/web-react';
import React, { useState } from 'react';
import { isElectronDesktop } from '@renderer/utils/platform';
import {
  WORKTREE_TERMINAL_DEFAULT_OPEN,
  nextTerminalOpenState,
  resolveWorktreeTerminalAvailability,
} from './worktreeTerminalState';

const { Text, Title } = Typography;

export type WorktreeTerminalPanelProps = {
  /** Optional override for tests. */
  isDesktop?: boolean;
};

/**
 * E11 first shell: collapsible worktree terminal chrome.
 * Desktop shows a placeholder until PTY wiring; WebUI shows desktop-only copy (D11-t2).
 */
const WorktreeTerminalPanel: React.FC<WorktreeTerminalPanelProps> = ({ isDesktop }) => {
  const desktop = isDesktop ?? isElectronDesktop();
  const availability = resolveWorktreeTerminalAvailability(desktop);
  const [open, setOpen] = useState(WORKTREE_TERMINAL_DEFAULT_OPEN);

  return (
    <div className='worktree-terminal border-t border-[var(--color-border-2)]' data-testid='worktree-terminal'>
      <div className='flex items-center justify-between px-12px py-8px gap-8px'>
        <Title heading={6} className='!mb-0'>
          Terminal
        </Title>
        <Button
          size='mini'
          data-testid='worktree-terminal-toggle'
          onClick={() => setOpen((v) => nextTerminalOpenState(v))}
        >
          {open ? 'Hide' : 'Show'}
        </Button>
      </div>
      {open ? (
        <div className='px-12px pb-12px' data-testid='worktree-terminal-body'>
          {availability === 'webui-stub' ? (
            <Text type='secondary' data-testid='worktree-terminal-webui-stub'>
              Worktree terminal is desktop-only in this version. Open CSBU WorkMate desktop to use an embedded terminal
              for the current project worktree.
            </Text>
          ) : (
            <div
              className='xterm rounded-6px bg-[var(--color-fill-2)] p-12px min-h-120px'
              data-testid='worktree-terminal-desktop-placeholder'
            >
              <Text type='secondary'>
                Terminal host placeholder — PTY wiring lands in a follow-up PR. Default remains collapsed.
              </Text>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default WorktreeTerminalPanel;
