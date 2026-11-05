/**
 * E14: client-side EventCursor store for headless Host reconnect.
 * Brand: CSBU WorkMate. Pure helpers — no AGPL.
 */

export type EventCursor = {
  epoch: number;
  sequence: number;
};

const STORAGE_KEY = 'workmate.realtime.eventCursor';

export function isEventCursor(value: unknown): value is EventCursor {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.epoch === 'number' && typeof v.sequence === 'number' && Number.isFinite(v.epoch) && Number.isFinite(v.sequence);
}

export function cursorFromEnvelope(payload: unknown): EventCursor | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const cursor = (payload as Record<string, unknown>).cursor;
  return isEventCursor(cursor) ? cursor : null;
}

/** Prefer the later cursor (higher epoch, then higher sequence). */
export function maxCursor(a: EventCursor | null, b: EventCursor | null): EventCursor | null {
  if (!a) return b;
  if (!b) return a;
  if (b.epoch !== a.epoch) return b.epoch > a.epoch ? b : a;
  return b.sequence >= a.sequence ? b : a;
}

export type EventCursorStore = {
  get(): EventCursor | null;
  set(cursor: EventCursor | null): void;
  note(cursor: EventCursor | null): void;
  clear(): void;
};

export function createMemoryCursorStore(initial: EventCursor | null = null): EventCursorStore {
  let current = initial;
  return {
    get: () => current,
    set: (cursor) => {
      current = cursor;
    },
    note: (cursor) => {
      current = maxCursor(current, cursor);
    },
    clear: () => {
      current = null;
    },
  };
}

/** sessionStorage-backed store; falls back to memory when storage is unavailable. */
export function createSessionCursorStore(storage?: Storage | null): EventCursorStore {
  const memory = createMemoryCursorStore(null);
  const ss =
    storage ??
    (typeof sessionStorage !== 'undefined'
      ? sessionStorage
      : null);

  const read = (): EventCursor | null => {
    if (!ss) return memory.get();
    try {
      const raw = ss.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isEventCursor(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const write = (cursor: EventCursor | null) => {
    memory.set(cursor);
    if (!ss) return;
    try {
      if (!cursor) {
        ss.removeItem(STORAGE_KEY);
      } else {
        ss.setItem(STORAGE_KEY, JSON.stringify(cursor));
      }
    } catch {
      /* quota / private mode */
    }
  };

  // hydrate memory from storage once
  write(read());

  return {
    get: () => memory.get() ?? read(),
    set: write,
    note: (cursor) => {
      write(maxCursor(memory.get() ?? read(), cursor));
    },
    clear: () => write(null),
  };
}

/** Build the outbound `resume` envelope for the Host. */
export function buildResumeMessage(cursor: EventCursor | null): {
  name: 'resume';
  data: Record<string, never>;
  cursor?: EventCursor;
} {
  if (!cursor) {
    return { name: 'resume', data: {} };
  }
  return { name: 'resume', data: {}, cursor };
}

/** Apply Host `resume.complete` data (+ optional envelope cursor) into the store. */
export function applyResumeComplete(
  store: EventCursorStore,
  data: unknown,
  envelopeCursor: EventCursor | null
): void {
  const fromEnvelope = envelopeCursor;
  let fromData: EventCursor | null = null;
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    if (typeof d.epoch === 'number' && typeof d.sequence === 'number') {
      fromData = { epoch: d.epoch, sequence: d.sequence };
    }
  }
  const next = fromEnvelope ?? fromData;
  if (next) {
    store.set(next);
  }
}
