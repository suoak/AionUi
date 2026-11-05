/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { worktreePty, type IWorktreePtySession } from '@/common/adapter/ipcBridge';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Button, Message, Space, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  WORKTREE_TERMINAL_DEFAULT_AGENT_ATTACHED,
  WORKTREE_TERMINAL_DEFAULT_OPEN,
  nextAgentAttachState,
  nextTerminalOpenState,
  resolveWorktreeTerminalAvailability,
} from './worktreeTerminalState';

const { Text, Title } = Typography;

export type WorktreeTerminalPanelProps = {
  /** Optional override for tests. */
  isDesktop?: boolean;
  /** Worktree / workspace cwd for the PTY. */
  cwd?: string;
};

/**
 * E11 worktree terminal: xterm view + node-pty host (desktop).
 * Agent cannot read PTY output until the user attaches (explicit gate).
 */
const WorktreeTerminalPanel: React.FC<WorktreeTerminalPanelProps> = ({ isDesktop, cwd }) => {
  const desktop = isDesktop ?? isElectronDesktop();
  const availability = resolveWorktreeTerminalAvailability(desktop);
  const [open, setOpen] = useState(WORKTREE_TERMINAL_DEFAULT_OPEN);
  const [session, setSession] = useState<IWorktreePtySession | null>(null);
  const [agentAttached, setAgentAttached] = useState(WORKTREE_TERMINAL_DEFAULT_AGENT_ATTACHED);
  const [busy, setBusy] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<{
    write: (data: string) => void;
    dispose: () => void;
    focus: () => void;
    onData: (cb: (data: string) => void) => { dispose: () => void };
  } | null>(null);
  const fitRef = useRef<{ fit: () => void } | null>(null);

  const disposeTerminal = useCallback(() => {
    termRef.current?.dispose();
    termRef.current = null;
    fitRef.current = null;
  }, []);

  const ensureXterm = useCallback(async () => {
    if (!hostRef.current || termRef.current) return;
    const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
    // CSS is side-effect; vite/electron-vite resolve package export.
    await import('@xterm/xterm/css/xterm.css');
    const term = new Terminal({
      convertEol: true,
      fontFamily: 'Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      theme: { background: '#1e1e1e' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
  }, []);

  const startSession = useCallback(async () => {
    if (!desktop || !cwd) {
      Message.warning('Open a project workspace to start the worktree terminal');
      return;
    }
    setBusy(true);
    try {
      await ensureXterm();
      const cols = 80;
      const rows = 24;
      const created = await worktreePty.create.invoke({ cwd, cols, rows });
      setSession(created);
      setAgentAttached(created.agentAttached);
      if (!created.available) {
        Message.warning(created.error ?? 'PTY unavailable');
        termRef.current?.write(`\r\n[worktree-terminal] ${created.error ?? 'PTY unavailable'}\r\n`);
        return;
      }
      termRef.current?.focus();
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [cwd, desktop, ensureXterm]);

  const stopSession = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      await worktreePty.kill.invoke({ id: session.id });
    } catch {
      // ignore
    } finally {
      setSession(null);
      setAgentAttached(false);
      setBusy(false);
    }
  }, [session]);

  // Wire xterm input → PTY and PTY data → xterm
  useEffect(() => {
    if (!session?.available || !termRef.current) return;
    const term = termRef.current;
    const inputDisp = term.onData((data) => {
      void worktreePty.write.invoke({ id: session.id, data }).catch(() => undefined);
    });
    const offData = worktreePty.onData.on((event) => {
      if (event.id === session.id) term.write(event.data);
    });
    const offExit = worktreePty.onExit.on((event) => {
      if (event.id === session.id) {
        term.write(`\r\n[exit ${event.exitCode}]\r\n`);
        setSession(null);
        setAgentAttached(false);
      }
    });
    return () => {
      inputDisp.dispose();
      offData();
      offExit();
    };
  }, [session]);

  // Fit on open / resize
  useEffect(() => {
    if (!open) return;
    void ensureXterm().then(() => fitRef.current?.fit());
  }, [open, ensureXterm]);

  useEffect(
    () => () => {
      void (async () => {
        if (session) {
          try {
            await worktreePty.kill.invoke({ id: session.id });
          } catch {
            // ignore
          }
        }
        disposeTerminal();
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
    },
    []
  );

  const toggleAgentAttach = async () => {
    if (!session) return;
    const next = nextAgentAttachState(agentAttached);
    try {
      const updated = await worktreePty.setAgentAttached.invoke({ id: session.id, attached: next });
      setAgentAttached(updated.agentAttached);
      Message.info(
        updated.agentAttached
          ? 'Agent can read this terminal output while attached'
          : 'Agent attach removed — agent cannot read this terminal'
      );
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className='worktree-terminal border-t border-[var(--color-border-2)]' data-testid='worktree-terminal'>
      <div className='flex items-center justify-between px-12px py-8px gap-8px'>
        <Title heading={6} className='!mb-0'>
          Terminal
        </Title>
        <Space size='mini'>
          {open && availability === 'desktop' ? (
            <>
              {!session ? (
                <Button size='mini' type='primary' loading={busy} onClick={() => void startSession()}>
                  Start
                </Button>
              ) : (
                <>
                  <Button
                    size='mini'
                    status={agentAttached ? 'warning' : 'default'}
                    data-testid='worktree-terminal-agent-attach'
                    onClick={() => void toggleAgentAttach()}
                  >
                    {agentAttached ? 'Detach agent' : 'Attach agent'}
                  </Button>
                  <Button size='mini' loading={busy} onClick={() => void stopSession()}>
                    Stop
                  </Button>
                </>
              )}
            </>
          ) : null}
          <Button
            size='mini'
            data-testid='worktree-terminal-toggle'
            onClick={() => setOpen((v) => nextTerminalOpenState(v))}
          >
            {open ? 'Hide' : 'Show'}
          </Button>
        </Space>
      </div>
      {open ? (
        <div className='px-12px pb-12px' data-testid='worktree-terminal-body'>
          {availability === 'webui-stub' ? (
            <Text type='secondary' data-testid='worktree-terminal-webui-stub'>
              Worktree terminal is desktop-only in this version. Open CSBU WorkMate desktop to use an embedded terminal
              for the current project worktree.
            </Text>
          ) : (
            <>
              <Text type='secondary' className='block mb-8px text-12px'>
                Agent cannot read this terminal unless you click Attach agent. Uses system shell via node-pty (MIT) +
                xterm.
              </Text>
              <div
                ref={hostRef}
                className='xterm rounded-6px bg-[#1e1e1e] min-h-160px overflow-hidden'
                data-testid='worktree-terminal-xterm'
              />
              {!cwd ? (
                <Text type='secondary' className='block mt-8px'>
                  Select a workspace to choose the PTY working directory.
                </Text>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default WorktreeTerminalPanel;
