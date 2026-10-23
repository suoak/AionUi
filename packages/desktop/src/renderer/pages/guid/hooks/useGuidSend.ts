/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { type ChatFileRef, chatFileRefPath } from '@/common/types/chatFile';
import type { IMcpServer, TProviderWithModel } from '@/common/config/storage';
import type { AgentCenterRunPlan } from '@/common/types/agent/agentCenterTypes';
import { buildMcpSelectionExtra, toSessionMcpServer } from '@/renderer/hooks/mcp/catalog';
import { emitter } from '@/renderer/utils/emitter';
import { updateWorkspaceTime } from '@/renderer/utils/workspace/workspaceHistory';
import { Message } from '@arco-design/web-react';
import { useCallback, useRef } from 'react';
import { type TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import { mutate as swrMutate } from 'swr';
import { getConversationCreateErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import type { CreateWorktreeInput, WorktreeInfo } from '@/common/types/worktree';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import {
  buildFanoutSlots,
  fanoutErrorKey,
  isFanoutUnavailableError,
  isValidSlotCount,
} from '@/renderer/pages/conversation/fanout/fanoutModel';
import {
  isKnownWorktreeErrorCode,
  isWorktreePrepareCancelled,
  isWorktreePrepareFailed,
  worktreeErrorKey,
} from '@/renderer/pages/conversation/fanout/worktreeModel';

/**
 * Where a new conversation runs (design E3 §4.2):
 *  - `local`: in the selected folder itself (or a temp workspace);
 *  - `worktree`: in a fresh managed git worktree of the selected repository;
 *  - `fanout`: several worktrees at once, one per slot assistant (E3-5).
 */
export type GuidWorkspaceMode = 'local' | 'worktree' | 'fanout';

/**
 * Thrown when Core cannot fan out (an older Core without `/api/fanout-groups`
 * answers 404, or Core reports `FANOUT_UNAVAILABLE`); never a silent fallback
 * to a local conversation.
 */
export class GuidFanoutUnavailableError extends Error {
  constructor() {
    super('fan-out is not available');
    this.name = 'GuidFanoutUnavailableError';
  }
}

/** Thrown when the fan-out slot list is outside Core's 2..5. */
export class GuidFanoutSlotsError extends Error {
  constructor() {
    super('fan-out needs 2 to 5 slots');
    this.name = 'GuidFanoutSlotsError';
  }
}

/**
 * Pick the send branch. Worktree / fan-out need a selected repository folder;
 * without one (or without a preparer) the send stays local.
 */
export const resolveGuidSendBranch = (input: {
  dir: string;
  workspaceMode?: GuidWorkspaceMode;
  canPrepareWorktree: boolean;
}): GuidWorkspaceMode => {
  if (!input.dir || !input.workspaceMode || input.workspaceMode === 'local') return 'local';
  if (input.workspaceMode === 'fanout') return 'fanout';
  return input.canPrepareWorktree ? 'worktree' : 'local';
};

export type GuidSendDeps = {
  // Input state
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  files: ChatFileRef[];
  setFiles: React.Dispatch<React.SetStateAction<ChatFileRef[]>>;
  dir: string;
  setDir: React.Dispatch<React.SetStateAction<string>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  loading: boolean;

  // Assistant state
  selectedAssistantId: string | null;
  selectedAssistantBackend: string;
  selectedMode: string;
  selectedAcpModel: string | null;
  selectedThoughtLevelValue?: string;
  current_model: TProviderWithModel | undefined;

  guidDisabledBuiltinSkills: string[] | undefined;
  guidEnabledSkills: string[] | undefined;
  assistantDefaultSkillIds?: string[];
  assistantDefaultDisabledBuiltinSkillIds?: string[];
  availableMcpServers: IMcpServer[];
  /**
   * C-06: false while the MCP catalog is still loading or failed to load.
   * `availableMcpServers` is then empty, and filtering the selection through
   * it would send an explicit empty allowlist that Core freezes into the
   * snapshot. Defaults to true.
   */
  mcpCatalogReady?: boolean;
  selectedMcpServerIds: string[] | undefined;
  assistantDefaultMcpIds?: string[];
  isGoogleAuth: boolean;

  // Mention state reset
  setMentionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionQuery: React.Dispatch<React.SetStateAction<string | null>>;
  setMentionSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionActiveIndex: React.Dispatch<React.SetStateAction<number>>;

  // Navigation
  navigate: NavigateFunction;
  t: TFunction;
  localeKey: string;
  agentCenterRunPlan?: AgentCenterRunPlan['create_conversation'];
  agentWorkflowStartAssistantId?: string;
  agentWorkflowRetryRunId?: string;
  agentWorkflowResumeRunId?: string;
  agentWorkflowResumeExecutionId?: string;
  agentWorkflowResumeMessage?: string;

  // Worktree mode (M7 E3-3)
  workspaceMode?: GuidWorkspaceMode;
  /** Start-from ref; empty ⇒ Core default (`origin/HEAD`, then current branch). */
  worktreeBaseRef?: string;
  /** Branch to create; empty ⇒ Core generates one. */
  worktreeBranch?: string;
  /** Creates the worktree and resolves once it is `ready` (see `useWorktreePreparation`). */
  prepareWorktree?: (input: CreateWorktreeInput) => Promise<WorktreeInfo>;

  // Fan-out mode (M7 E3-5)
  /** One assistant id per slot (2..5); each slot runs with that assistant's own permission mode. */
  fanoutAssistantIds?: string[];
};

export type GuidSendResult = {
  handleSend: () => Promise<void>;
  sendMessageHandler: () => void;
  isButtonDisabled: boolean;
};

/**
 * Hook that manages the send logic for ACP and CSBU WorkMate conversations.
 */
export const useGuidSend = (deps: GuidSendDeps): GuidSendResult => {
  const {
    input,
    setInput,
    files,
    setFiles,
    dir,
    setDir,
    setLoading,
    loading,
    selectedAssistantId,
    selectedAssistantBackend,
    selectedMode,
    selectedAcpModel,
    selectedThoughtLevelValue,
    current_model,
    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    assistantDefaultSkillIds,
    assistantDefaultDisabledBuiltinSkillIds,
    availableMcpServers,
    mcpCatalogReady = true,
    selectedMcpServerIds,
    assistantDefaultMcpIds,
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    navigate,
    t,
    localeKey,
    agentCenterRunPlan,
    agentWorkflowStartAssistantId,
    agentWorkflowRetryRunId,
    agentWorkflowResumeRunId,
    agentWorkflowResumeExecutionId,
    agentWorkflowResumeMessage,
    workspaceMode,
    worktreeBaseRef,
    worktreeBranch,
    prepareWorktree,
    fanoutAssistantIds,
  } = deps;
  const sendingRef = useRef(false);

  const handleSend = useCallback(async () => {
    if (!selectedAssistantId) {
      return;
    }
    if (agentWorkflowStartAssistantId && !input.trim()) {
      return;
    }
    if (selectedAssistantBackend === 'aionrs' && !current_model) {
      Message.warning(t('conversation.noModelConfigured'));
      return;
    }

    const sendBranch = resolveGuidSendBranch({ dir, workspaceMode, canPrepareWorktree: Boolean(prepareWorktree) });
    if (sendBranch === 'fanout') {
      const slots = buildFanoutSlots(fanoutAssistantIds ?? []);
      if (!isValidSlotCount(slots.length)) throw new GuidFanoutSlotsError();
      let group;
      try {
        group = await ipcBridge.fanout.create.invoke({
          repo_path: dir,
          base_ref: worktreeBaseRef?.trim() || undefined,
          prompt: input,
          files: files.length > 0 ? files : undefined,
          slots,
        });
      } catch (error) {
        if (isFanoutUnavailableError(error)) throw new GuidFanoutUnavailableError();
        throw error;
      }
      updateWorkspaceTime(dir);
      await navigate(`/fanout/${encodeURIComponent(group.id)}`);
      return;
    }
    const isCustomWorkspace = !!dir;
    let finalWorkspace = dir || '';
    let boundWorktree: WorktreeInfo | undefined;

    let workflowRunId = agentWorkflowResumeRunId;
    let workflowExecutionId = agentWorkflowResumeExecutionId;
    let workflowConversationPlan = agentCenterRunPlan;
    let initialInput = agentWorkflowResumeMessage ?? input;
    if (agentWorkflowStartAssistantId) {
      const run = await ipcBridge.agentCenter.startWorkflowRun.invoke({
        id: agentWorkflowStartAssistantId,
        input,
      });
      workflowRunId = run.id;
      if (run.next_action?.kind !== 'run_agent') {
        await ipcBridge.agentCenter.cancelWorkflowRun.invoke({ id: run.id });
        throw new Error('Workflow run did not provide an agent action');
      }
      workflowConversationPlan = run.next_action.create_conversation;
      initialInput = run.next_action.message || input;
    } else if (agentWorkflowRetryRunId) {
      const run = await ipcBridge.agentCenter.retryWorkflowRun.invoke({ id: agentWorkflowRetryRunId });
      workflowRunId = run.id;
      if (run.next_action?.kind !== 'run_agent') {
        throw new Error('Workflow retry did not provide an agent action');
      }
      workflowExecutionId = run.next_action.execution_id;
      workflowConversationPlan = run.next_action.create_conversation;
      initialInput = run.next_action.message || input;
    }

    const assistantConversationId = workflowConversationPlan?.assistant?.id ?? selectedAssistantId;
    const assistantBackend = selectedAssistantBackend;
    const enabled_skills_to_send = guidEnabledSkills ?? assistantDefaultSkillIds;
    const excludeBuiltinSkills = guidDisabledBuiltinSkills ?? assistantDefaultDisabledBuiltinSkillIds;
    const plannedMcpServerIds = workflowConversationPlan?.assistant?.conversation_overrides?.mcp_ids;
    const selectedAllMcpServerIds = plannedMcpServerIds ?? selectedMcpServerIds ?? [];
    const selectedMcpServerIdSet = new Set(selectedAllMcpServerIds);
    const selectedUserMcpServerIds = availableMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id) && server.builtin !== true)
      .map((server) => server.id);
    const selectedBuiltinSessionMcpServers = availableMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id) && server.builtin === true)
      .map((server) => toSessionMcpServer(server));
    const defaultSelectedMcpServerIds = assistantDefaultMcpIds;
    const defaultSelectedUserMcpServerIds = availableMcpServers
      .filter((server) => (defaultSelectedMcpServerIds ?? []).includes(server.id) && server.builtin !== true)
      .map((server) => server.id);
    const assistantOverrideMcpIds =
      plannedMcpServerIds ??
      (selectedMcpServerIds !== undefined ? selectedAllMcpServerIds : defaultSelectedMcpServerIds);
    const selectedUserMcpServerIdsToSend =
      plannedMcpServerIds !== undefined || selectedMcpServerIds !== undefined
        ? selectedUserMcpServerIds
        : defaultSelectedUserMcpServerIds;
    const selectedSessionMcpServersToSend =
      plannedMcpServerIds !== undefined || selectedMcpServerIds !== undefined
        ? selectedBuiltinSessionMcpServers
        : availableMcpServers
            .filter((server) => (defaultSelectedMcpServerIds ?? []).includes(server.id))
            .map((server) => toSessionMcpServer(server));
    // C-06: without a loaded catalog the two lists above are empty by
    // construction. Leave the keys out so Core falls back to the assistant
    // snapshot (or the enabled servers) instead of freezing "no MCP".
    const mcpSelectionExtra = buildMcpSelectionExtra(
      mcpCatalogReady,
      selectedUserMcpServerIdsToSend,
      selectedSessionMcpServersToSend
    );

    // `current_model` is the aionrs provider selection and means nothing to a
    // CLI agent, which owns its own model list. Used as a blanket fallback it
    // leaked into the FIRST turn of every CLI conversation: before the agent's
    // catalog has been probed the two preceding options are empty, so a brand
    // new Antigravity conversation started with e.g. `gemini-3.1-pro-preview`
    // — a provider model agy has never heard of — and the turn failed with
    // USER_LLM_PROVIDER_MODEL_NOT_FOUND. Once the catalog lands the second
    // option wins, which is why it only ever reproduced on first use.
    //
    // Omitting it lets the agent start on its own default, which is what a user
    // who has not picked a model means. The cron dialog already gates the same
    // value this way (`resolvedBackend !== 'aionrs' → undefined`).
    //
    // The cached `current_model_id` is NOT a fallback for the same reason, and it
    // used to defeat the very intent described above. It is whatever the LAST
    // session of this agent wrote back, so an unpicked conversation inherited a
    // stranger's choice: for claude that was usually its `default` row, which
    // PINS the account default and overrides the user's own ANTHROPIC_MODEL — so
    // the app ran a different model than `claude` in a terminal did, and the
    // picker contradicted itself (the row promised one model, the session used
    // another). Omit it: no pick means no override, and the agent resolves the
    // model from the user's own config.
    const assistantOverrideModel =
      selectedAcpModel || (assistantBackend === 'aionrs' ? current_model?.use_model : undefined) || undefined;
    const assistantOverrides = workflowConversationPlan?.assistant?.conversation_overrides ?? {
      model: assistantOverrideModel,
      permission: selectedMode || undefined,
      thought_level: selectedThoughtLevelValue || undefined,
      skill_ids: enabled_skills_to_send,
      disabled_builtin_skill_ids: excludeBuiltinSkills,
      mcp_ids: assistantOverrideMcpIds,
    };
    let conversationCreated = false;
    const cancelUnstartedWorkflow = async () => {
      if (boundWorktree && !conversationCreated) {
        // The worktree is ready but nothing holds it: drop it (Core keeps the
        // branch if it somehow gained commits).
        const orphan = boundWorktree;
        boundWorktree = undefined;
        try {
          await ipcBridge.worktree.remove.invoke({ id: orphan.id, branch: 'auto' });
        } catch (error) {
          console.error('Failed to remove unused worktree after conversation creation failed:', error);
        }
      }
      if (!workflowRunId || conversationCreated) return;
      try {
        if (agentWorkflowRetryRunId || agentWorkflowResumeRunId) {
          await ipcBridge.agentCenter.advanceWorkflowRun.invoke({
            id: workflowRunId,
            execution_id: workflowExecutionId,
            success: false,
            error: t('conversation.createFailed'),
          });
        } else {
          await ipcBridge.agentCenter.cancelWorkflowRun.invoke({ id: workflowRunId });
        }
      } catch (error) {
        console.error('Failed to cancel workflow run after conversation creation failed:', error);
      }
    };

    if (sendBranch === 'worktree' && prepareWorktree) {
      try {
        boundWorktree = await prepareWorktree({
          repo_path: dir,
          base_ref: worktreeBaseRef?.trim() || undefined,
          branch: worktreeBranch?.trim() || undefined,
          title: (workflowConversationPlan?.name ?? input).slice(0, 80) || undefined,
        });
      } catch (error) {
        await cancelUnstartedWorkflow();
        throw error;
      }
      finalWorkspace = boundWorktree.path;
    }
    const worktreeId = boundWorktree?.id;

    if (assistantBackend === 'aionrs') {
      try {
        const conversation = await ipcBridge.conversation.create.invoke({
          name: workflowConversationPlan?.name ?? input,
          model: current_model,
          worktree_id: worktreeId,
          assistant: {
            id: assistantConversationId,
            locale: workflowConversationPlan?.assistant?.locale ?? localeKey,
            conversation_overrides: assistantOverrides,
          },
          extra: {
            ...workflowConversationPlan?.extra,
            default_files: files.map(chatFileRefPath),
            workspace: finalWorkspace,
            custom_workspace: isCustomWorkspace,
            ...mcpSelectionExtra,
          },
        });

        if (!conversation || !conversation.id) {
          Message.error(t('conversation.createFailed'));
          await cancelUnstartedWorkflow();
          return;
        }
        conversationCreated = true;

        if (isCustomWorkspace) {
          updateWorkspaceTime(dir);
        }

        if (assistantConversationId) {
          await Promise.all([
            swrMutate(`guid.assistant.detail.${assistantConversationId}.${localeKey}`),
            swrMutate('assistants.list'),
          ]);
        }

        emitter.emit('chat.history.refresh');

        // Empty input = "start chat": create the conversation but do not stash an
        // initial message, so the window opens idle on the empty state instead of
        // auto-sending a blank first turn.
        if (initialInput.trim()) {
          const initialMessage = {
            input: initialInput,
            files: files.length > 0 ? files : undefined,
          };
          sessionStorage.setItem(`aionrs_initial_message_${conversation.id}`, JSON.stringify(initialMessage));
        }

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        await cancelUnstartedWorkflow();
        console.error('Failed to create CSBU WorkMate conversation:', error);
        throw error;
      }
      return;
    }

    try {
      const conversation = await ipcBridge.conversation.create.invoke({
        name: workflowConversationPlan?.name ?? input,
        worktree_id: worktreeId,
        assistant: {
          id: assistantConversationId,
          locale: workflowConversationPlan?.assistant?.locale ?? localeKey,
          conversation_overrides: assistantOverrides,
        },
        extra: {
          ...workflowConversationPlan?.extra,
          workspace: finalWorkspace,
          custom_workspace: isCustomWorkspace,
          default_files: files.map(chatFileRefPath),
          ...mcpSelectionExtra,
        },
      });
      if (!conversation || !conversation.id) {
        console.error('Failed to create ACP conversation - conversation object is null or missing id');
        await cancelUnstartedWorkflow();
        return;
      }
      conversationCreated = true;

      if (isCustomWorkspace) {
        updateWorkspaceTime(dir);
      }

      if (assistantConversationId) {
        await Promise.all([
          swrMutate(`guid.assistant.detail.${assistantConversationId}.${localeKey}`),
          swrMutate('assistants.list'),
        ]);
      }

      emitter.emit('chat.history.refresh');

      // Empty input = "start chat": create the conversation but do not stash an
      // initial message, so the window opens idle on the empty state instead of
      // auto-sending a blank first turn.
      if (initialInput.trim()) {
        const initialMessage = {
          input: initialInput,
          files: files.length > 0 ? files : undefined,
        };
        sessionStorage.setItem(`acp_initial_message_${conversation.id}`, JSON.stringify(initialMessage));
      }

      await navigate(`/conversation/${conversation.id}`);
    } catch (error: unknown) {
      await cancelUnstartedWorkflow();
      console.error('Failed to create ACP conversation:', error);
      throw error;
    }
  }, [
    input,
    files,
    dir,
    selectedAssistantId,
    selectedAssistantBackend,
    selectedMode,
    selectedAcpModel,
    selectedThoughtLevelValue,
    current_model,
    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    assistantDefaultSkillIds,
    assistantDefaultDisabledBuiltinSkillIds,
    availableMcpServers,
    mcpCatalogReady,
    selectedMcpServerIds,
    assistantDefaultMcpIds,
    navigate,
    t,
    localeKey,
    agentCenterRunPlan,
    agentWorkflowStartAssistantId,
    agentWorkflowRetryRunId,
    agentWorkflowResumeRunId,
    agentWorkflowResumeExecutionId,
    agentWorkflowResumeMessage,
    workspaceMode,
    worktreeBaseRef,
    worktreeBranch,
    prepareWorktree,
    fanoutAssistantIds,
  ]);

  const sendMessageHandler = useCallback(() => {
    if (loading || sendingRef.current) return;
    sendingRef.current = true;
    setLoading(true);
    handleSend()
      .then(() => {
        setInput('');
        setMentionOpen(false);
        setMentionQuery(null);
        setMentionSelectorOpen(false);
        setMentionActiveIndex(0);
        setFiles([]);
        setDir('');
      })
      .catch((error) => {
        // Worktree cancel / failure: the preparing card already shows it.
        if (isWorktreePrepareCancelled(error) || isWorktreePrepareFailed(error)) return;
        if (error instanceof GuidFanoutUnavailableError) {
          Message.warning(t('conversation.worktree.fanoutUnavailable'));
          return;
        }
        if (error instanceof GuidFanoutSlotsError) {
          Message.warning(t('conversation.fanout.slotCountInvalid'));
          return;
        }
        if (
          isBackendHttpError(error) &&
          error.code &&
          fanoutErrorKey(error.code) !== 'conversation.fanout.errors.UNKNOWN'
        ) {
          // Rejected by `POST /api/fanout-groups` (slot limit, bad assistant, …).
          Message.error(t(fanoutErrorKey(error.code)));
          return;
        }
        if (isBackendHttpError(error) && isKnownWorktreeErrorCode(error.code)) {
          // Rejected synchronously by `POST /api/worktrees` (bad ref, branch exists, …).
          Message.error(t(worktreeErrorKey(error.code)));
          return;
        }
        console.error('Failed to send message:', error);
        Message.error(getConversationCreateErrorMessage(error, t));
      })
      .finally(() => {
        sendingRef.current = false;
        setLoading(false);
      });
  }, [
    loading,
    handleSend,
    setLoading,
    setInput,
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    setFiles,
    setDir,
    t,
  ]);

  // Calculate button disabled state
  // Calculate button disabled state. Empty input is allowed once an assistant is
  // picked — that path creates an empty conversation ("start chat") rather than
  // sending a message, so the gate only blocks while loading or with no assistant.
  const isButtonDisabled = loading || !selectedAssistantId || Boolean(agentWorkflowStartAssistantId && !input.trim());

  return {
    handleSend,
    sendMessageHandler,
    isButtonDisabled,
  };
};
