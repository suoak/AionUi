/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConversationCapabilities } from '@/common/adapter/ipcBridge';
import {
  normalizeApprovalPolicy,
  normalizeCompactionKeepN,
  normalizeJournalTranscript,
  type ConversationHostPolicy,
  type JournalApprovalPolicy,
  type JournalTranscript,
} from '@/common/types/journalTranscript';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function useConversationTrajectory(conversationId: string | undefined) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [error, setError] = useState(false);
  const [transcript, setTranscript] = useState<JournalTranscript | null>(null);
  const [capabilities, setCapabilities] = useState<IConversationCapabilities | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!conversationId) {
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(false);
    try {
      const getCapabilities = ipcBridge.conversation.getCapabilities;
      const capabilityPromise: Promise<IConversationCapabilities | null> = getCapabilities
        ? getCapabilities.invoke({ conversation_id: conversationId }).catch((): null => null)
        : Promise.resolve(null);
      const [raw, capabilitySnapshot] = await Promise.all([
        ipcBridge.conversation.getJournalTranscript.invoke({
          conversation_id: conversationId,
          visibility: 'host',
        }),
        capabilityPromise,
      ]);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setTranscript(normalizeJournalTranscript(raw, conversationId));
      setCapabilities(capabilitySnapshot);
    } catch {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(true);
      setTranscript(null);
      setCapabilities(null);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [conversationId]);

  const savePolicy = useCallback(
    async (patch: { approval?: JournalApprovalPolicy; compaction_keep_n?: number }) => {
      if (!conversationId) {
        return;
      }
      setSavingPolicy(true);
      try {
        const policy: ConversationHostPolicy = await ipcBridge.conversation.setHostPolicy.invoke({
          conversation_id: conversationId,
          ...patch,
        });
        setTranscript((current) =>
          current
            ? {
                ...current,
                approval_policy: normalizeApprovalPolicy(policy.approval),
                compaction_keep_n: normalizeCompactionKeepN(policy.compaction_keep_n),
              }
            : current
        );
        await load();
      } catch {
        Message.error(t('conversation.trajectory.policy.saveFailed'));
      } finally {
        setSavingPolicy(false);
      }
    },
    [conversationId, load, t]
  );

  useEffect(() => {
    requestIdRef.current += 1;
    setVisible(false);
    setLoading(false);
    setSavingPolicy(false);
    setError(false);
    setTranscript(null);
    setCapabilities(null);
  }, [conversationId]);

  useEffect(() => {
    if (!visible || !conversationId) {
      return;
    }
    void load();
  }, [visible, conversationId, load]);

  return {
    visible,
    setVisible,
    loading,
    error,
    transcript,
    capabilities,
    savingPolicy,
    savePolicy,
    reload: load,
  };
}
