/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { ipcBridge } from '@/common';
import type { TaskApproval } from '@/common/types/agent/taskSession';
import type { ITaskApprovalChangedEvent } from '@/common/types/device';

/**
 * M8 E9-3: Plan/Goal approval decisions made on a paired phone.
 *
 * Core broadcasts `task.approval.changed` when an approval is raised or
 * answered; aioncore ≥ E9-3 adds `decided_via` (`device` | `user`). Only
 * `device` decisions are remembered here so the desktop can say "approved on
 * your phone". Older cores omit the field: the desktop still refreshes, but
 * never claims a phone decision it cannot prove. Kept in memory for the
 * session only — Core does not persist who decided.
 */
export type PhoneApprovalDecision = {
  approval_id: string;
  task_session_id: string;
  status: 'approved' | 'rejected';
  device_id?: string | null;
};

type Listener = (event: ITaskApprovalChangedEvent) => void;

let decisions = new Map<string, PhoneApprovalDecision>();
let version = 0;
const storeListeners = new Set<() => void>();
const eventListeners = new Set<Listener>();
let dispose: (() => void) | null = null;

const notifyStore = () => {
  version += 1;
  storeListeners.forEach((l) => l());
};

/** Pure: the phone decision an event describes, if any. */
export function phoneDecisionFromEvent(
  event: ITaskApprovalChangedEvent | undefined | null
): PhoneApprovalDecision | null {
  if (!event?.approval_id || !event.task_session_id) return null;
  if (event.decided_via !== 'device') return null;
  if (event.status !== 'approved' && event.status !== 'rejected') return null;
  return {
    approval_id: event.approval_id,
    task_session_id: event.task_session_id,
    status: event.status,
    device_id: event.device_id ?? null,
  };
}

export const applyTaskApprovalChanged = (event: ITaskApprovalChangedEvent | undefined): void => {
  if (!event?.approval_id) return;
  const decision = phoneDecisionFromEvent(event);
  if (decision) {
    decisions = new Map(decisions).set(decision.approval_id, decision);
    notifyStore();
  } else if (decisions.has(event.approval_id) && event.status === 'pending') {
    // Defensive: an approval id is never reopened, but do not keep a stale label.
    decisions = new Map(decisions);
    decisions.delete(event.approval_id);
    notifyStore();
  }
  eventListeners.forEach((l) => l(event));
};

/** Attach the single app-wide WS listener (idempotent). */
export const ensureTaskApprovalListener = (): void => {
  if (dispose) return;
  const off = ipcBridge.taskSession?.approvalChanged?.on?.(applyTaskApprovalChanged);
  dispose = typeof off === 'function' ? off : () => {};
};

export const getPhoneDecision = (approvalId: string | null | undefined): PhoneApprovalDecision | undefined =>
  approvalId ? decisions.get(approvalId) : undefined;

/** Latest phone decision for a work item, by insertion order. */
export const getLatestPhoneDecisionForTask = (
  taskSessionId: string | null | undefined
): PhoneApprovalDecision | undefined => {
  if (!taskSessionId) return undefined;
  let latest: PhoneApprovalDecision | undefined;
  decisions.forEach((d) => {
    if (d.task_session_id === taskSessionId) latest = d;
  });
  return latest;
};

/**
 * The phone decision to surface on a work item's approval card: only when it
 * answered the item's most recent approval and Core's current status agrees
 * (a later desktop resubmission or supersede hides the label).
 */
export const phoneDecisionForLatestApproval = (
  approvals: readonly TaskApproval[] | undefined
): PhoneApprovalDecision | undefined => {
  if (!approvals?.length) return undefined;
  const latest = approvals.reduce((a, b) => (b.requested_at > a.requested_at ? b : a));
  const decision = decisions.get(latest.id);
  return decision && decision.status === latest.status ? decision : undefined;
};

const subscribeStore = (listener: () => void) => {
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
};
const getVersion = () => version;

/** Re-render on phone decisions; returns a version counter for memo deps. */
export const usePhoneApprovalDecisions = (): number => {
  useEffect(() => {
    ensureTaskApprovalListener();
  }, []);
  return useSyncExternalStore(subscribeStore, getVersion, getVersion);
};

/**
 * Run `onChange` for every `task.approval.changed` touching `taskSessionId`
 * (phone, another desktop window, or Core-side supersede).
 */
export const useTaskApprovalChanged = (
  taskSessionId: string | null | undefined,
  onChange: (event: ITaskApprovalChangedEvent) => void
): void => {
  const ref = useRef(onChange);
  useEffect(() => {
    ref.current = onChange;
  });
  useEffect(() => {
    ensureTaskApprovalListener();
    if (!taskSessionId) return undefined;
    const listener: Listener = (event) => {
      if (event.task_session_id === taskSessionId) ref.current(event);
    };
    eventListeners.add(listener);
    return () => {
      eventListeners.delete(listener);
    };
  }, [taskSessionId]);
};

/** Test hook: reset module state between cases. */
export const resetTaskApprovalStoreForTests = (): void => {
  dispose?.();
  dispose = null;
  decisions = new Map();
  version = 0;
  storeListeners.clear();
  eventListeners.clear();
};
