/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';

let currentAssistants: Assistant[] = [];
let currentProviders: IProvider[] = [];

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN' },
  }),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      addJob: { invoke: vi.fn() },
      createJob: { invoke: vi.fn() },
      updateJob: { invoke: vi.fn() },
    },
    conversation: {
      get: { invoke: vi.fn() },
    },
    channel: {
      getActiveSessions: { invoke: vi.fn() },
      getAuthorizedUsers: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@renderer/components/base/WorkMateModal', () => ({
  __esModule: true,
  default: ({
    visible,
    children,
    onOk,
    onCancel,
  }: {
    visible: boolean;
    children: React.ReactNode;
    onOk?: () => void;
    onCancel?: () => void;
  }) =>
    visible ? (
      <div>
        {children}
        <button type='button' data-testid='modal-ok' onClick={onOk}>
          OK
        </button>
        <button type='button' data-testid='modal-cancel' onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock('@renderer/pages/conversation/hooks/useConversationAssistants', () => ({
  useConversationAssistants: () => ({
    presetAssistants: currentAssistants,
  }),
}));

vi.mock('@renderer/hooks/agent/useModelProviderList', () => ({
  useModelProviderList: () => ({
    providers: currentProviders,
    getAvailableModels: (provider: IProvider) => provider.models ?? [],
    formatModelLabel: (label: string) => label,
  }),
}));

vi.mock('@renderer/pages/guid/components/GuidModelSelector', () => ({
  __esModule: true,
  default: ({
    current_model,
    setCurrentModel,
    providerDropdownTrigger,
  }: {
    current_model?: TProviderWithModel;
    setCurrentModel: (model: TProviderWithModel) => Promise<void>;
    providerDropdownTrigger?: string;
  }) => (
    <div data-testid='guid-model-selector' data-trigger={providerDropdownTrigger}>
      <span data-testid='selected-cron-model'>{current_model?.use_model}</span>
      <button
        type='button'
        data-testid='select-deepseek-model'
        onClick={() =>
          void setCurrentModel({ ...currentProviders[1], use_model: 'deepseek-v4-pro' } as TProviderWithModel)
        }
      >
        DeepSeek
      </button>
    </div>
  ),
}));

vi.mock('@renderer/components/workspace', () => ({
  WorkspaceFolderSelect: () => <div data-testid='workspace-folder-select' />,
}));

vi.mock('@renderer/pages/cron/cronUtils', () => ({
  createCronSchedule: (expr: string, description: string) => ({
    kind: 'cron',
    expr,
    timezone: 'Asia/Shanghai',
    description,
  }),
}));

vi.mock('@renderer/pages/conversation/utils/conversationCreateError', () => ({
  getConversationCreateErrorMessage: () => 'error',
}));

vi.mock('@renderer/utils/model/assistantAvatar', () => ({
  resolveAssistantAvatar: () => ({ kind: 'emoji', value: '🤖' }),
}));

vi.mock('@renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
  resolveAgentLogo: () => null,
}));

vi.mock('@renderer/utils/model/agentTypeSupportPolicy', () => ({
  resolveSupportedConversationType: () => 'acp',
}));

vi.mock('@renderer/pages/cron/ScheduledTasksPage/resolveCronAgentConfig', () => ({
  resolveCronAgentConfig: vi.fn(() => ({
    agent_config: {
      assistant_id: 'assistant-1',
      name: '问好助手',
      mode: 'default',
    },
  })),
}));

import { Message } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import CreateTaskDialog from '@/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog';

describe('CreateTaskDialog · Autopilot (E8-6)', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    currentAssistants = assistants();
    currentProviders = [];
    vi.mocked(ipcBridge.cron.addJob.invoke).mockResolvedValue(job());
    vi.mocked(ipcBridge.cron.updateJob.invoke).mockResolvedValue(job());
    vi.mocked(ipcBridge.conversation.get.invoke).mockRejectedValue(new Error('not found'));
    vi.mocked(ipcBridge.channel.getActiveSessions.invoke).mockResolvedValue([
      { id: 'sess-tg', user_id: 'u-tg', agent_type: 'acp', chatId: 'chat-1', created_at: 1, lastActivity: 5 },
      { id: 'sess-nochat', user_id: 'u-tg', agent_type: 'acp', created_at: 1, lastActivity: 9 },
    ]);
    vi.mocked(ipcBridge.channel.getAuthorizedUsers.invoke).mockResolvedValue([
      { id: 'u-tg', platformUserId: 'tg-1', platformType: 'telegram', display_name: 'Lian', authorizedAt: 1 },
    ]);
  });

  const confirmModal = () => within(screen.getByTestId('cron-autopilot-yolo-confirm').parentElement as HTMLElement);

  it('is off by default and sends no Autopilot fields', async () => {
    const user = userEvent.setup();
    render(<CreateTaskDialog visible onClose={() => {}} editJob={job()} />);

    const toggle = await screen.findByTestId('cron-autopilot-switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('cron-autopilot-yolo-switch')).toBeNull();
    expect(ipcBridge.channel.getActiveSessions.invoke).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('modal-ok'));
    await waitFor(() => expect(ipcBridge.cron.updateJob.invoke).toHaveBeenCalledTimes(1));
    const [{ updates }] = vi.mocked(ipcBridge.cron.updateJob.invoke).mock.calls[0];
    expect(updates.state).not.toHaveProperty('autopilot');
    expect(updates.state).not.toHaveProperty('autopilot_yolo');
    expect(updates.state).not.toHaveProperty('notify_channel_id');
  });

  it('enables Autopilot in Ask mode with one of my channels', async () => {
    const user = userEvent.setup();
    render(<CreateTaskDialog visible onClose={() => {}} editJob={job()} />);

    await user.click(await screen.findByTestId('cron-autopilot-switch'));
    expect(screen.getByTestId('cron-autopilot-guardrails')).toBeInTheDocument();
    expect(screen.getByTestId('cron-autopilot-yolo-switch')).toHaveAttribute('aria-checked', 'false');

    await waitFor(() => expect(ipcBridge.channel.getAuthorizedUsers.invoke).toHaveBeenCalledTimes(1));
    await user.click(screen.getByTestId('cron-autopilot-channel-select'));
    fireEvent.click(await screen.findByText('Telegram · Lian'));
    // The session without a chat cannot receive the summary, so it is not offered.
    expect(document.querySelectorAll('.arco-select-option')).toHaveLength(2);

    await user.click(screen.getByTestId('modal-ok'));
    await waitFor(() => expect(ipcBridge.cron.updateJob.invoke).toHaveBeenCalledTimes(1));
    const [{ updates }] = vi.mocked(ipcBridge.cron.updateJob.invoke).mock.calls[0];
    expect(updates.state).toMatchObject({ autopilot: true, notify_channel_id: 'sess-tg' });
    expect(updates.state).not.toHaveProperty('autopilot_yolo');
  });

  it('needs a second confirmation that spells out the risk before full-auto turns on', async () => {
    const user = userEvent.setup();
    render(<CreateTaskDialog visible onClose={() => {}} editJob={job()} />);

    await user.click(await screen.findByTestId('cron-autopilot-switch'));
    const yolo = screen.getByTestId('cron-autopilot-yolo-switch');

    // First attempt: cancel keeps full-auto off.
    await user.click(yolo);
    expect(screen.getByText('cron.autopilot.yolo.riskCommands')).toBeInTheDocument();
    expect(screen.getByText('cron.autopilot.yolo.riskIrreversible')).toBeInTheDocument();
    expect(screen.getByText('cron.autopilot.yolo.riskUnattended')).toBeInTheDocument();
    expect(yolo).toHaveAttribute('aria-checked', 'false');
    await user.click(confirmModal().getByTestId('modal-cancel'));
    await waitFor(() => expect(screen.queryByTestId('cron-autopilot-yolo-confirm')).toBeNull());
    expect(yolo).toHaveAttribute('aria-checked', 'false');

    // Second attempt: confirming turns full-auto on and it is sent.
    await user.click(yolo);
    await user.click(confirmModal().getByTestId('modal-ok'));
    await waitFor(() => expect(screen.queryByTestId('cron-autopilot-yolo-confirm')).toBeNull());
    expect(screen.getByTestId('cron-autopilot-yolo-switch')).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByTestId('modal-ok'));
    await waitFor(() => expect(ipcBridge.cron.updateJob.invoke).toHaveBeenCalledTimes(1));
    const [{ updates }] = vi.mocked(ipcBridge.cron.updateJob.invoke).mock.calls[0];
    expect(updates.state).toMatchObject({ autopilot: true, autopilot_yolo: true });
  });

  it('turning Autopilot off also drops full-auto', async () => {
    const user = userEvent.setup();
    render(
      <CreateTaskDialog
        visible
        onClose={() => {}}
        editJob={withState(job(), { autopilot: true, autopilot_yolo: true, notify_channel_id: 'sess-tg' })}
      />
    );

    expect(await screen.findByTestId('cron-autopilot-yolo-switch')).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByTestId('cron-autopilot-switch'));
    expect(screen.queryByTestId('cron-autopilot-yolo-switch')).toBeNull();

    await user.click(screen.getByTestId('modal-ok'));
    await waitFor(() => expect(ipcBridge.cron.updateJob.invoke).toHaveBeenCalledTimes(1));
    const [{ updates }] = vi.mocked(ipcBridge.cron.updateJob.invoke).mock.calls[0];
    expect(updates.state).toMatchObject({ autopilot: false, autopilot_yolo: false });
  });

  it('still saves to the Inbox only when my channels cannot be loaded', async () => {
    const user = userEvent.setup();
    vi.mocked(ipcBridge.channel.getActiveSessions.invoke).mockRejectedValue(new Error('offline'));
    render(<CreateTaskDialog visible onClose={() => {}} editJob={job()} />);

    await user.click(await screen.findByTestId('cron-autopilot-switch'));
    expect(await screen.findByText('cron.autopilot.channel.loadFailed')).toBeInTheDocument();

    await user.click(screen.getByTestId('modal-ok'));
    await waitFor(() => expect(ipcBridge.cron.updateJob.invoke).toHaveBeenCalledTimes(1));
    const [{ updates }] = vi.mocked(ipcBridge.cron.updateJob.invoke).mock.calls[0];
    expect(updates.state).toMatchObject({ autopilot: true });
    expect(updates.state).not.toHaveProperty('notify_channel_id');
  });

  it('cannot be enabled when the job runs in plan or goal mode', async () => {
    render(<CreateTaskDialog visible onClose={() => {}} editJob={lockedJobWithMode('plan')} />);

    const toggle = await screen.findByTestId('cron-autopilot-switch');
    expect(toggle).toBeDisabled();
    expect(screen.getByTestId('cron-autopilot-blocked')).toHaveTextContent('cron.autopilot.modeBlocked');
  });

  it('does not offer full-auto on an agent-created task', async () => {
    const user = userEvent.setup();
    const agentJob = { ...job(), metadata: { ...job().metadata, created_by: 'agent' } } as ICronJob;
    render(<CreateTaskDialog visible onClose={() => {}} editJob={agentJob} />);

    await user.click(await screen.findByTestId('cron-autopilot-switch'));
    expect(screen.getByTestId('cron-autopilot-yolo-switch')).toBeDisabled();
    expect(screen.getByText('cron.autopilot.yolo.agentCreated')).toBeInTheDocument();
  });

  it.each([
    [403, 'Forbidden.', 'cron.autopilot.error.forbidden'],
    [400, "notify channel 'sess-tg' has no paired user", 'cron.autopilot.error.invalidChannel'],
    [400, 'mode `goal` cannot be used with Autopilot', 'cron.autopilot.error.modeBlocked'],
    [400, 'autopilot_yolo requires autopilot to be enabled', 'cron.autopilot.error.yoloNeedsAutopilot'],
  ])('shows a localised message for a %s from Core', async (status, error, expected) => {
    const user = userEvent.setup();
    vi.mocked(ipcBridge.cron.updateJob.invoke).mockRejectedValue(
      new BackendHttpError({ method: 'PUT', path: '/api/cron/jobs/job-1', status, body: { error, code: 'X' } })
    );
    render(<CreateTaskDialog visible onClose={() => {}} editJob={job()} />);

    await user.click(await screen.findByTestId('cron-autopilot-switch'));
    await user.click(screen.getByTestId('modal-ok'));

    await waitFor(() => expect(Message.error).toHaveBeenCalledWith(expected));
  });

  it('falls back to the generic message for other errors', async () => {
    const user = userEvent.setup();
    vi.mocked(ipcBridge.cron.updateJob.invoke).mockRejectedValue(
      new BackendHttpError({ method: 'PUT', path: '/api/cron/jobs/job-1', status: 500, body: { error: 'boom' } })
    );
    render(<CreateTaskDialog visible onClose={() => {}} editJob={job()} />);

    await user.click(await screen.findByTestId('cron-autopilot-switch'));
    await user.click(screen.getByTestId('modal-ok'));

    await waitFor(() => expect(Message.error).toHaveBeenCalledWith('error'));
  });

  it('creates a new Autopilot task with the confirmed settings', async () => {
    const user = userEvent.setup();
    render(<CreateTaskDialog visible onClose={() => {}} />);

    await user.type(await screen.findByPlaceholderText('cron.page.form.namePlaceholder'), 'nightly');
    await user.type(screen.getByPlaceholderText('cron.page.form.promptPlaceholder'), 'Check the build');
    await user.click(screen.getByTestId('cron-assistant-select'));
    const assistantOption = await waitFor(() => {
      const option = document.querySelector('.arco-select-option');
      if (!option) throw new Error('assistant option not found');
      return option;
    });
    fireEvent.click(assistantOption);

    await user.click(screen.getByTestId('cron-autopilot-switch'));
    await user.click(screen.getByTestId('modal-ok'));

    await waitFor(() => expect(ipcBridge.cron.addJob.invoke).toHaveBeenCalledTimes(1));
    const [params] = vi.mocked(ipcBridge.cron.addJob.invoke).mock.calls[0];
    expect(params).toMatchObject({ autopilot: true, autopilot_yolo: false, created_by: 'user' });
    expect(params).not.toHaveProperty('notify_channel_id');
  });
});

function withState(base: ICronJob, state: Partial<ICronJob['state']>): ICronJob {
  return { ...base, state: { ...base.state, ...state } } as ICronJob;
}

function lockedJobWithMode(mode: string): ICronJob {
  const base = job();
  return {
    ...base,
    target: { ...base.target, execution_mode: 'existing' },
    metadata: { ...base.metadata, agent_config: { ...base.metadata.agent_config, mode } },
  } as ICronJob;
}

function assistants(): Assistant[] {
  return [
    {
      id: 'assistant-1',
      source: 'user',
      name: '问好助手',
      name_i18n: {},
      description_i18n: {},
      avatar: '🤖',
      enabled: true,
      sort_order: 0,
      agent_id: 'agent-codex',
      agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: [],
      prompts_i18n: {},
      models: [],
    } as Assistant,
  ];
}

function job(): ICronJob {
  return {
    id: 'job-1',
    name: '问好',
    description: '描述',
    enabled: true,
    schedule: { kind: 'cron', expr: '0 10 * * *', timezone: 'Asia/Shanghai', description: 'daily' },
    metadata: {
      created_at_ms: 1,
      updated_at_ms: 1,
      next_run_at_ms: 1,
      status: 'paused',
      created_by: 'user',
      agent_type: 'acp',
      agent_config: {
        assistant_id: 'assistant-1',
        backend: 'codex',
        name: '问好助手',
        preset_agent_type: 'codex',
        is_preset: true,
      },
    },
    target: { execution_mode: 'new_conversation', payload: { text: 'original prompt' } },
    state: { next_run_at_ms: 1, run_count: 0, retry_count: 0, max_retries: 0, queue_enabled: false },
  } as ICronJob;
}
