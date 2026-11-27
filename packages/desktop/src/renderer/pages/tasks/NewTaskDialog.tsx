/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { assistantRuntimeKey } from '@/common/types/agent/assistantTypes';
import type { CreateTaskSessionInput, StartTaskResult, TaskSession } from '@/common/types/agent/taskSession';
import { resolveLocaleKey } from '@/common/utils';
import { resolveAssistantName } from '@/renderer/utils/model/assistantDisplay';
import { selectableAssistants } from '@/renderer/utils/model/assistantSelection';
import { Checkbox, Input, Message, Modal, Select, Switch } from '@arco-design/web-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Where a new task comes from; a message turned into a task keeps a link back to it. */
export type NewTaskPrefill = {
  prompt?: string;
  title?: string;
  assistantId?: string;
  projectId?: string;
  conversationId?: string;
  /** Message id (`source = conversation`). */
  sourceRef?: string;
  repoPath?: string;
};

export type NewTaskOutcome = {
  task: TaskSession;
  /** `null` when the task was left in To do (or the Core cannot start tasks). */
  start: StartTaskResult | null;
};

type Props = {
  visible: boolean;
  prefill?: NewTaskPrefill;
  onClose: () => void;
  onCreated?: (outcome: NewTaskOutcome) => void;
};

const TITLE_MAX = 80;

/** First non-empty line of the prompt, trimmed to a card-sized title. */
export const titleFromPrompt = (prompt: string): string => {
  const line =
    prompt
      .split('\n')
      .map((part) => part.trim())
      .find(Boolean) ?? '';
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
};

/** Body for `POST /api/task-sessions` (Core ≥ 0.6 task flow; older cores ignore the extra fields). */
export const buildCreateTaskInput = (
  form: { title: string; prompt: string; planFirst: boolean },
  assistant: Pick<Assistant, 'id' | 'agent'> | null,
  prefill?: NewTaskPrefill
): CreateTaskSessionInput => {
  const prompt = form.prompt.trim();
  const fromConversation = Boolean(prefill?.sourceRef);
  return {
    title: form.title.trim() || titleFromPrompt(prompt),
    mode: form.planFirst ? 'plan' : 'agent',
    objective: prompt,
    acceptance_criteria: [],
    status: 'ready',
    agent_type: assistantRuntimeKey(assistant) || 'aionrs',
    ...(assistant ? { assistant_id: assistant.id } : {}),
    prompt: { text: prompt },
    plan_first: form.planFirst,
    source: fromConversation ? 'conversation' : 'manual',
    ...(fromConversation ? { source_ref: prefill?.sourceRef } : {}),
    ...(prefill?.projectId ? { project_id: prefill.projectId } : {}),
    ...(prefill?.repoPath ? { repo_path: prefill.repoPath } : {}),
  };
};

/** Older cores have no start endpoint: the task is created and stays in To do. */
const isStartUnsupported = (error: unknown): boolean =>
  isBackendHttpError(error) && (error.status === 404 || error.status === 405);

const errorReason = (error: unknown): string => {
  if (isBackendHttpError(error)) return error.backendMessage || error.message;
  return error instanceof Error ? error.message : String(error);
};

const NewTaskDialog: React.FC<Props> = ({ visible, prefill, onClose, onCreated }) => {
  const { t, i18n } = useTranslation();
  const localeKey = resolveLocaleKey(i18n.language);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [assistantId, setAssistantId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [planFirst, setPlanFirst] = useState(false);
  // D5: a new task starts right away unless the user unticks this.
  const [startNow, setStartNow] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Callers may pass a fresh prefill object each render; read it once per open.
  const prefillRef = useRef(prefill);
  prefillRef.current = prefill;

  useEffect(() => {
    if (!visible) return;
    const initial = prefillRef.current;
    setTitle(initial?.title ?? '');
    setPrompt(initial?.prompt ?? '');
    setPlanFirst(false);
    setStartNow(true);
    setSubmitting(false);
    let cancelled = false;
    ipcBridge.assistants.list
      .invoke()
      .then((list) => {
        if (cancelled) return;
        const usable = selectableAssistants(Array.isArray(list) ? list : []);
        setAssistants(usable);
        setAssistantId((prev) => {
          const wanted = initial?.assistantId ?? prev;
          if (wanted && usable.some((a) => a.id === wanted)) return wanted;
          return usable[0]?.id;
        });
      })
      .catch((error) => console.error('[NewTaskDialog] Failed to load assistants:', error));
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const assistant = useMemo(() => assistants.find((a) => a.id === assistantId) ?? null, [assistants, assistantId]);
  const canSubmit = prompt.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const task = await ipcBridge.taskSession.create.invoke(
        buildCreateTaskInput({ title, prompt, planFirst }, assistant, prefillRef.current)
      );
      let start: StartTaskResult | null = null;
      if (startNow && assistant) {
        try {
          start = await ipcBridge.taskSession.board.start.invoke({ id: task.id });
          if (start.state === 'queued' || start.state === 'already_queued') {
            Message.info(t('conversation.taskBoard.flow.queued'));
          } else {
            Message.success(t('conversation.taskBoard.newTask.started'));
          }
        } catch (error) {
          if (isStartUnsupported(error)) {
            Message.info(t('conversation.taskBoard.newTask.startUnsupported'));
          } else {
            Message.warning(t('conversation.taskBoard.newTask.createdNotStarted', { reason: errorReason(error) }));
          }
        }
      } else {
        Message.success(t('conversation.taskBoard.newTask.created'));
      }
      onCreated?.({ task, start });
      onClose();
    } catch (error) {
      console.error('[NewTaskDialog] Failed to create task:', error);
      Message.error(t('conversation.taskBoard.newTask.createFailed', { reason: errorReason(error) }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      title={t('conversation.taskBoard.newTask.title')}
      onCancel={onClose}
      onOk={() => void submit()}
      okText={
        startNow ? t('conversation.taskBoard.newTask.createAndStart') : t('conversation.taskBoard.newTask.create')
      }
      cancelText={t('common.cancel')}
      okButtonProps={{ disabled: !canSubmit, loading: submitting, 'data-testid': 'new-task-submit' } as never}
      unmountOnExit
      data-testid='new-task-dialog'
    >
      <div className='flex flex-col gap-14px' data-testid='new-task-form'>
        <label className='flex flex-col gap-6px'>
          <span className='text-13px text-t-secondary'>{t('conversation.taskBoard.newTask.prompt')}</span>
          <Input.TextArea
            autoFocus
            value={prompt}
            onChange={setPrompt}
            autoSize={{ minRows: 4, maxRows: 12 }}
            placeholder={t('conversation.taskBoard.newTask.promptPlaceholder')}
            data-testid='new-task-prompt'
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </label>
        <label className='flex flex-col gap-6px'>
          <span className='text-13px text-t-secondary'>{t('conversation.taskBoard.newTask.taskTitle')}</span>
          <Input
            value={title}
            onChange={setTitle}
            maxLength={200}
            placeholder={titleFromPrompt(prompt) || t('conversation.taskBoard.newTask.titlePlaceholder')}
            data-testid='new-task-title'
          />
        </label>
        <label className='flex flex-col gap-6px'>
          <span className='text-13px text-t-secondary'>{t('conversation.taskBoard.newTask.assistant')}</span>
          <Select
            value={assistantId}
            onChange={setAssistantId}
            placeholder={t('conversation.taskBoard.newTask.assistantPlaceholder')}
            data-testid='new-task-assistant'
            showSearch
            filterOption={(input, option) =>
              String((option as { props?: { children?: unknown } })?.props?.children ?? '')
                .toLowerCase()
                .includes(input.toLowerCase())
            }
          >
            {assistants.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {resolveAssistantName(item, localeKey, item.id)}
              </Select.Option>
            ))}
          </Select>
        </label>
        <div className='flex flex-wrap items-center gap-16px'>
          <label className='flex items-center gap-8px text-13px text-t-primary cursor-pointer'>
            <Switch size='small' checked={planFirst} onChange={setPlanFirst} data-testid='new-task-plan-first' />
            <span>{t('conversation.taskBoard.flow.planFirst')}</span>
          </label>
          <Checkbox
            checked={startNow && Boolean(assistant)}
            disabled={!assistant}
            onChange={setStartNow}
            data-testid='new-task-start-now'
          >
            {t('conversation.taskBoard.newTask.startNow')}
          </Checkbox>
        </div>
        <div className='text-12px text-t-tertiary'>
          {planFirst
            ? t('conversation.taskBoard.newTask.planFirstHint')
            : t('conversation.taskBoard.newTask.startHint')}
        </div>
      </div>
    </Modal>
  );
};

export default NewTaskDialog;
