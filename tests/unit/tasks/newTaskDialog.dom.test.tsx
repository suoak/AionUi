/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import { BackendHttpError } from '@/common/adapter/httpBridge';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  start: vi.fn(),
  assistants: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: { list: { invoke: mocks.assistants } },
    taskSession: {
      create: { invoke: mocks.create },
      board: { start: { invoke: mocks.start } },
    },
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

import NewTaskDialog, { buildCreateTaskInput, titleFromPrompt } from '@/renderer/pages/tasks/NewTaskDialog';

const ASSISTANTS = [
  { id: 'bare:1', name: 'CSBU WorkMate', enabled: true, sort_order: -1, agent: { type: 'aionrs' } },
  { id: 'claude-1', name: 'Claude', enabled: true, sort_order: 1, agent: { type: 'acp', acp_backend: 'claude' } },
  { id: 'off', name: 'Disabled', enabled: false, sort_order: 2, agent: { type: 'acp', acp_backend: 'codex' } },
];

beforeEach(() => {
  mocks.assistants.mockResolvedValue(ASSISTANTS);
  mocks.create.mockResolvedValue({ id: 'task_1', title: 'Fix login', status: 'ready' });
  mocks.start.mockResolvedValue({ state: 'started', item: { id: 'task_1' } });
  vi.spyOn(Message, 'success').mockImplementation(() => () => {});
  vi.spyOn(Message, 'info').mockImplementation(() => () => {});
  vi.spyOn(Message, 'warning').mockImplementation(() => () => {});
  vi.spyOn(Message, 'error').mockImplementation(() => () => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('titleFromPrompt / buildCreateTaskInput', () => {
  it('takes the first non-empty line and trims long titles', () => {
    expect(titleFromPrompt('\n  Fix the login timeout \nmore detail')).toBe('Fix the login timeout');
    expect(titleFromPrompt('x'.repeat(200))).toHaveLength(80);
  });

  it('builds a Core 0.6 create body', () => {
    expect(
      buildCreateTaskInput({ title: '', prompt: ' Fix login ', planFirst: true }, ASSISTANTS[1] as never, {
        sourceRef: 'msg-9',
        projectId: 'p1',
      })
    ).toEqual({
      title: 'Fix login',
      mode: 'plan',
      objective: 'Fix login',
      acceptance_criteria: [],
      status: 'ready',
      agent_type: 'claude',
      assistant_id: 'claude-1',
      prompt: { text: 'Fix login' },
      plan_first: true,
      source: 'conversation',
      source_ref: 'msg-9',
      project_id: 'p1',
    });
    const manual = buildCreateTaskInput({ title: 'T', prompt: 'p', planFirst: false }, null);
    expect(manual).toMatchObject({ mode: 'agent', source: 'manual', agent_type: 'aionrs', plan_first: false });
    expect(manual).not.toHaveProperty('assistant_id');
  });
});

const typePrompt = (text: string) =>
  fireEvent.change(screen.getByTestId('new-task-prompt'), { target: { value: text } });
const submitButton = () => document.querySelector('[data-testid="new-task-submit"]') as HTMLButtonElement;

describe('NewTaskDialog', () => {
  it('creates and immediately starts the task with the first enabled assistant (D5)', async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<NewTaskDialog visible onClose={onClose} onCreated={onCreated} />);
    await waitFor(() => expect(mocks.assistants).toHaveBeenCalled());
    expect(submitButton().disabled).toBe(true);
    typePrompt('Fix the login timeout');
    await waitFor(() => expect(submitButton().disabled).toBe(false));
    fireEvent.click(submitButton());

    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith({ id: 'task_1' }));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Fix the login timeout',
        assistant_id: 'bare:1',
        prompt: { text: 'Fix the login timeout' },
        source: 'manual',
      })
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ start: expect.anything() })));
    expect(onClose).toHaveBeenCalled();
    expect(Message.success).toHaveBeenCalledWith('conversation.taskBoard.newTask.started');
  });

  it('leaves the task in To do when "Start immediately" is unticked', async () => {
    render(<NewTaskDialog visible onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.assistants).toHaveBeenCalled());
    typePrompt('Weekly report');
    fireEvent.click(screen.getByTestId('new-task-start-now').querySelector('input')!);
    fireEvent.click(submitButton());
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('reports a queued start and an older Core without the start endpoint', async () => {
    mocks.start.mockResolvedValueOnce({ state: 'queued', item: { id: 'task_1' } });
    const { unmount } = render(<NewTaskDialog visible onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.assistants).toHaveBeenCalled());
    typePrompt('A');
    fireEvent.click(submitButton());
    await waitFor(() => expect(Message.info).toHaveBeenCalledWith('conversation.taskBoard.flow.queued'));
    unmount();

    mocks.start.mockRejectedValueOnce(
      new BackendHttpError({ method: 'POST', path: '/api/task-sessions/task_1/start', status: 404, body: 'not found' })
    );
    render(<NewTaskDialog visible onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.assistants).toHaveBeenCalledTimes(2));
    typePrompt('B');
    fireEvent.click(submitButton());
    await waitFor(() => expect(Message.info).toHaveBeenCalledWith('conversation.taskBoard.newTask.startUnsupported'));
  });

  it('prefills from a message and links back to it', async () => {
    render(
      <NewTaskDialog visible onClose={vi.fn()} prefill={{ prompt: 'Turn this into slides', sourceRef: 'msg-42' }} />
    );
    await waitFor(() => expect(mocks.assistants).toHaveBeenCalled());
    expect((screen.getByTestId('new-task-prompt') as HTMLTextAreaElement).value).toBe('Turn this into slides');
    fireEvent.click(submitButton());
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'conversation', source_ref: 'msg-42' })
      )
    );
  });

  it('keeps the dialog open and shows the Core error when create fails', async () => {
    mocks.create.mockRejectedValueOnce(
      new BackendHttpError({
        method: 'POST',
        path: '/api/task-sessions',
        status: 400,
        body: { success: false, error: 'repo_path is not a git repository', code: 'BAD_REQUEST' },
      })
    );
    const onClose = vi.fn();
    render(<NewTaskDialog visible onClose={onClose} />);
    await waitFor(() => expect(mocks.assistants).toHaveBeenCalled());
    typePrompt('C');
    fireEvent.click(submitButton());
    await waitFor(() => expect(Message.error).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
