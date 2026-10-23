/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const listeners: Array<(event: unknown) => void> = [];
const replay = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    taskSession: { run: { replay: { invoke: replay } } },
    taskTrace: {
      appended: {
        on: (cb: (event: unknown) => void) => {
          listeners.push(cb);
          return () => listeners.splice(listeners.indexOf(cb), 1);
        },
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import TaskRunReplayTimeline from '@/renderer/pages/conversation/components/TaskRunReplayTimeline';

const ev = (sequence: number, event_type: string) => ({
  event_id: `e${sequence}`,
  task_id: 'task-1',
  run_id: 'run-1',
  sequence,
  timestamp: sequence,
  event_type,
  payload: {},
});

const page = (events: ReturnType<typeof ev>[], next: number) => ({
  run: { id: 'run-1' } as never,
  events,
  next_after_sequence: next,
  has_more: false,
  latest_sequence: next,
  retention_gap: false,
});

describe('TaskRunReplayTimeline live tail', () => {
  it('fetches from the cursor when task.trace.appended matches the run', async () => {
    replay.mockImplementation(() => Promise.resolve(page([ev(2, 'tool.completed')], 2)));
    render(<TaskRunReplayTimeline taskId='task-1' runId='run-1' firstPage={page([ev(1, 'tool.started')], 1)} />);
    expect(screen.getByText('tool.started')).toBeInTheDocument();

    act(() =>
      listeners.forEach((l) =>
        l({ task_session_id: 'task-1', run_id: 'other-run', event_id: 'x', event_type: 'a', timestamp: 1 })
      )
    );
    expect(replay).not.toHaveBeenCalled();

    act(() =>
      listeners.forEach((l) =>
        l({ task_session_id: 'task-1', run_id: 'run-1', event_id: 'e2', event_type: 'tool.completed', timestamp: 2 })
      )
    );
    await waitFor(() =>
      expect(replay).toHaveBeenCalledWith({
        id: 'task-1',
        run_id: 'run-1',
        after_sequence: 1,
        limit: expect.any(Number),
      })
    );
    expect(await screen.findByText('tool.completed')).toBeInTheDocument();
  });
});
