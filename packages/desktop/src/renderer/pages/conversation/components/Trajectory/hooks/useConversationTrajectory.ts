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
  type RawTrajectoryEvent,
  type TrajectoryOverview,
  type TrajectoryProjection,
  type TrajectoryRecord,
} from '@/common/types/journalTranscript';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 100;
const RAW_PREVIEW_CHARS = 240;

const emptyOverview = (): TrajectoryOverview => ({
  turns: 0,
  steps: 0,
  tools: 0,
  errors: 0,
  tokens: {},
});

const rawRecord = (event: RawTrajectoryEvent): TrajectoryRecord => {
  const output = JSON.stringify(event.payload);
  return {
    record_id: `raw:${event.event_id}`,
    category: 'raw',
    status: 'raw',
    visibility: 'host',
    started_at_ms: event.timestamp_ms,
    completed_at_ms: event.timestamp_ms,
    title: event.kind,
    summary: event.kind,
    output_preview: output.length > RAW_PREVIEW_CHARS ? `${output.slice(0, RAW_PREVIEW_CHARS)}...` : output,
    tokens: {},
    first_sequence: event.sequence,
    last_sequence: event.sequence,
    source_sequences: [event.sequence],
    detail: event.payload,
  };
};

const mergeRecords = (current: TrajectoryRecord[], incoming: TrajectoryRecord[]) => {
  const records = new Map(current.map((record) => [record.record_id, record]));
  for (const record of incoming) {
    const previous = records.get(record.record_id);
    records.set(record.record_id, {
      ...previous,
      ...record,
      detail: record.detail ?? previous?.detail,
    });
  }
  return [...records.values()].toSorted((left, right) => left.first_sequence - right.first_sequence);
};

export function useConversationTrajectory(conversationId: string | undefined) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [error, setError] = useState(false);
  const [records, setRecords] = useState<TrajectoryRecord[]>([]);
  const [overview, setOverview] = useState<TrajectoryOverview>(emptyOverview);
  const [hasMore, setHasMore] = useState(false);
  const [oldestSequence, setOldestSequence] = useState<number>();
  const [transcript, setTranscript] = useState<JournalTranscript | null>(null);
  const [capabilities, setCapabilities] = useState<IConversationCapabilities | null>(null);
  const [selected, setSelected] = useState<TrajectoryRecord | null>(null);
  const requestIdRef = useRef(0);
  const incrementalLoadingRef = useRef(false);
  const journalCursorRef = useRef(0);
  const notifiedRevisionRef = useRef(0);

  const applySemanticPage = useCallback(
    (page: TrajectoryProjection, mode: 'initial' | 'prepend' | 'append' = 'append') => {
      setRecords((current) => mergeRecords(current, page.records));
      setSelected((current) => {
        if (!current) return current;
        const update = page.records.find((record) => record.record_id === current.record_id);
        return update ? { ...current, ...update, detail: update.detail ?? current.detail } : current;
      });
      setOverview(page.overview);
      if (mode !== 'append') setHasMore(page.has_more);
      if (mode !== 'append') setOldestSequence(page.oldest_sequence);
    },
    []
  );

  const load = useCallback(async () => {
    if (!conversationId) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadingOlder(false);
    setSavingPolicy(false);
    setError(false);
    try {
      const [page, rawTranscript, capabilitySnapshot] = await Promise.all([
        rawMode
          ? ipcBridge.conversation.getRawTrajectory.invoke({ conversation_id: conversationId, limit: PAGE_SIZE })
          : ipcBridge.conversation.getTrajectory.invoke({ conversation_id: conversationId, limit: PAGE_SIZE }),
        ipcBridge.conversation.getJournalTranscript.invoke({ conversation_id: conversationId, visibility: 'host' }),
        ipcBridge.conversation.getCapabilities.invoke({ conversation_id: conversationId }).catch((): null => null),
      ]);
      if (requestId !== requestIdRef.current) return;
      if (rawMode && 'events' in page) {
        const next = page.events.map(rawRecord);
        setRecords(next);
        setOverview(emptyOverview());
        setHasMore(page.has_more);
        setOldestSequence(page.oldest_sequence);
      } else if (!rawMode && 'records' in page) {
        setRecords([]);
        applySemanticPage(page, 'initial');
        journalCursorRef.current = page.log_revision;
        notifiedRevisionRef.current = Math.max(notifiedRevisionRef.current, page.log_revision);
      }
      setTranscript(normalizeJournalTranscript(rawTranscript, conversationId));
      setCapabilities(capabilitySnapshot ?? null);
      setSelected(null);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setError(true);
      setRecords([]);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [applySemanticPage, conversationId, rawMode]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder || !hasMore || oldestSequence === undefined) return;
    const requestId = requestIdRef.current;
    setLoadingOlder(true);
    try {
      if (rawMode) {
        const page = await ipcBridge.conversation.getRawTrajectory.invoke({
          conversation_id: conversationId,
          before_sequence: oldestSequence,
          limit: PAGE_SIZE,
        });
        if (requestId !== requestIdRef.current) return;
        setRecords((current) => mergeRecords(current, page.events.map(rawRecord)));
        setHasMore(page.has_more);
        setOldestSequence(page.oldest_sequence);
      } else {
        const page = await ipcBridge.conversation.getTrajectory.invoke({
          conversation_id: conversationId,
          before_sequence: oldestSequence,
          limit: PAGE_SIZE,
        });
        if (requestId !== requestIdRef.current) return;
        applySemanticPage(page, 'prepend');
      }
    } catch {
      if (requestId !== requestIdRef.current) return;
      Message.error(t('conversation.trajectory.loadFailed'));
    } finally {
      if (requestId === requestIdRef.current) setLoadingOlder(false);
    }
  }, [applySemanticPage, conversationId, hasMore, loadingOlder, oldestSequence, rawMode, t]);

  const loadDetail = useCallback(
    async (record: TrajectoryRecord) => {
      setSelected(record);
      if (!conversationId || rawMode || record.detail !== undefined) return;
      const requestId = requestIdRef.current;
      try {
        const detail = await ipcBridge.conversation.getTrajectoryRecord.invoke({
          conversation_id: conversationId,
          record_id: record.record_id,
        });
        if (requestId !== requestIdRef.current) return;
        setSelected(detail);
        setRecords((current) => current.map((item) => (item.record_id === detail.record_id ? detail : item)));
      } catch {
        if (requestId !== requestIdRef.current) return;
        Message.error(t('conversation.trajectory.detailLoadFailed'));
      }
    },
    [conversationId, rawMode, t]
  );

  const loadIncremental = useCallback(async () => {
    if (!conversationId || incrementalLoadingRef.current) return;
    incrementalLoadingRef.current = true;
    const requestId = requestIdRef.current;
    let cursor = journalCursorRef.current;
    try {
      while (requestId === requestIdRef.current) {
        // Cursor pages are ordered and each next request depends on the previous response.
        // eslint-disable-next-line no-await-in-loop
        const page = await ipcBridge.conversation.getTrajectory.invoke({
          conversation_id: conversationId,
          after_sequence: cursor,
          limit: PAGE_SIZE,
        });
        if (requestId !== requestIdRef.current) return;
        applySemanticPage(page);
        if (page.has_more) {
          const nextCursor = page.newest_sequence ?? cursor;
          if (nextCursor <= cursor) return;
          cursor = nextCursor;
          journalCursorRef.current = cursor;
          continue;
        }
        cursor = Math.max(cursor, page.log_revision);
        journalCursorRef.current = cursor;
        if (cursor >= notifiedRevisionRef.current) return;
      }
    } catch {
      // The next journal notification retries from the last successfully applied sequence.
    } finally {
      incrementalLoadingRef.current = false;
    }
  }, [applySemanticPage, conversationId]);

  const savePolicy = useCallback(
    async (patch: { approval?: JournalApprovalPolicy; compaction_keep_n?: number }) => {
      if (!conversationId) return;
      const requestId = requestIdRef.current;
      setSavingPolicy(true);
      try {
        const policy: ConversationHostPolicy = await ipcBridge.conversation.setHostPolicy.invoke({
          conversation_id: conversationId,
          ...patch,
        });
        if (requestId !== requestIdRef.current) return;
        setTranscript((current) =>
          current
            ? {
                ...current,
                approval_policy: normalizeApprovalPolicy(policy.approval),
                compaction_keep_n: normalizeCompactionKeepN(policy.compaction_keep_n),
              }
            : current
        );
      } catch {
        if (requestId !== requestIdRef.current) return;
        Message.error(t('conversation.trajectory.policy.saveFailed'));
      } finally {
        if (requestId === requestIdRef.current) setSavingPolicy(false);
      }
    },
    [conversationId, t]
  );

  useEffect(() => {
    requestIdRef.current += 1;
    setVisible(false);
    setRawMode(false);
    setRecords([]);
    setOverview(emptyOverview());
    setSelected(null);
    setLoadingOlder(false);
    setSavingPolicy(false);
    journalCursorRef.current = 0;
    notifiedRevisionRef.current = 0;
  }, [conversationId]);

  useEffect(() => {
    if (visible) void load();
  }, [load, visible]);

  useEffect(() => {
    if (!visible || rawMode || !conversationId || !ipcBridge.conversation.trajectoryChanged?.on) return;
    return ipcBridge.conversation.trajectoryChanged.on((event) => {
      if (event.conversation_id !== conversationId || event.log_revision <= journalCursorRef.current) return;
      notifiedRevisionRef.current = Math.max(notifiedRevisionRef.current, event.log_revision);
      void loadIncremental();
    });
  }, [conversationId, loadIncremental, rawMode, visible]);

  useEffect(() => {
    if (!visible || rawMode || !conversationId || !ipcBridge.conversation.inputChanged?.on) return;
    return ipcBridge.conversation.inputChanged.on((event) => {
      if (event.input.conversation_id === conversationId) void loadIncremental();
    });
  }, [conversationId, loadIncremental, rawMode, visible]);

  useEffect(() => {
    if (!visible || rawMode || !conversationId || !ipcBridge.conversation.cancellationChanged?.on) return;
    return ipcBridge.conversation.cancellationChanged.on((event) => {
      if (event.conversation_id === conversationId) void loadIncremental();
    });
  }, [conversationId, loadIncremental, rawMode, visible]);

  return useMemo(
    () => ({
      visible,
      setVisible,
      rawMode,
      setRawMode,
      loading,
      loadingOlder,
      error,
      records,
      overview,
      hasMore,
      transcript,
      capabilities,
      selected,
      savingPolicy,
      loadOlder,
      loadDetail,
      savePolicy,
      reload: load,
    }),
    [
      capabilities,
      error,
      hasMore,
      load,
      loadDetail,
      loadOlder,
      loading,
      loadingOlder,
      overview,
      rawMode,
      records,
      savePolicy,
      savingPolicy,
      selected,
      transcript,
      visible,
    ]
  );
}
