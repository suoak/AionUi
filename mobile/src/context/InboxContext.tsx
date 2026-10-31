import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useConnection } from './ConnectionContext';
import { bridge } from '../services/bridge';
import {
  listAgentApprovals,
  listInbox,
  markAllInboxRead,
  markInboxRead,
  type AgentApproval,
  type InboxItem,
} from '../services/inbox';

/** Core realtime events that change what the Inbox tab shows. */
export const INBOX_REFRESH_EVENTS = ['inbox.changed', 'task.approval.changed', 'agent.actionApproval'] as const;
const REFRESH_DEBOUNCE_MS = 300;

type InboxContextType = {
  items: InboxItem[];
  unreadCount: number;
  agentApprovals: AgentApproval[];
  loading: boolean;
  loaded: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const InboxContext = createContext<InboxContextType>({
  items: [],
  unreadCount: 0,
  agentApprovals: [],
  loading: false,
  loaded: false,
  error: false,
  refresh: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
});

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const { isConfigured, connectionState } = useConnection();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [agentApprovals, setAgentApprovals] = useState<AgentApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configuredRef = useRef(isConfigured);
  configuredRef.current = isConfigured;

  const refresh = useCallback(async () => {
    if (!configuredRef.current) return;
    setLoading(true);
    try {
      const [inbox, approvals] = await Promise.all([listInbox({ limit: 100 }), listAgentApprovals()]);
      setItems(inbox.items);
      setUnreadCount(inbox.unread_count);
      setAgentApprovals(approvals.filter((a) => a.status === 'pending'));
      setError(false);
      setLoaded(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  // Reset when unpaired, load when (re)connected.
  useEffect(() => {
    if (!isConfigured) {
      setItems([]);
      setUnreadCount(0);
      setAgentApprovals([]);
      setLoaded(false);
      setError(false);
      return;
    }
    if (connectionState === 'connected') void refresh();
  }, [isConfigured, connectionState, refresh]);

  useEffect(() => {
    const unsubs = INBOX_REFRESH_EVENTS.map((name) => bridge.on(name, scheduleRefresh));
    return () => {
      unsubs.forEach((unsub) => unsub());
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scheduleRefresh]);

  const markRead = useCallback(async (id: string) => {
    try {
      const result = await markInboxRead(id);
      const now = Date.now();
      setItems((prev) => prev.map((item) => (item.id === id && !item.read_at ? { ...item, read_at: now } : item)));
      if (typeof result?.unread_count === 'number') setUnreadCount(result.unread_count);
    } catch {
      // Non-critical: the next refresh shows the server state.
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      const result = await markAllInboxRead();
      const now = Date.now();
      setItems((prev) => prev.map((item) => (item.read_at ? item : { ...item, read_at: now })));
      setUnreadCount(typeof result?.unread_count === 'number' ? result.unread_count : 0);
    } catch {
      // Non-critical.
    }
  }, []);

  return (
    <InboxContext.Provider
      value={{ items, unreadCount, agentApprovals, loading, loaded, error, refresh, markRead, markAllRead }}
    >
      {children}
    </InboxContext.Provider>
  );
}

export function useInbox() {
  return useContext(InboxContext);
}
