/**
 * `csbu-workmate://inbox/{id}` deep links (M8 E9-4).
 *
 * Core's push notifications end with this link. expo-router maps it to
 * `app/(tabs)/inbox/[id].tsx`; when the phone is not paired yet the id is
 * parked here and opened right after pairing succeeds.
 */
export const APP_SCHEME = 'csbu-workmate';

const INBOX_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidInboxId(id: unknown): id is string {
  return typeof id === 'string' && INBOX_ID_PATTERN.test(id);
}

export function inboxItemHref(id: string): string {
  return `/inbox/${encodeURIComponent(id)}`;
}

/** Extract the inbox id from `csbu-workmate://inbox/{id}` (or null). */
export function parseInboxDeepLink(url: string): string | null {
  const match = new RegExp(`^${APP_SCHEME}://inbox/([^/?#]+)/?(?:[?#].*)?$`).exec(url.trim());
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return isValidInboxId(id) ? id : null;
}

let pendingInboxId: string | null = null;

export function setPendingInboxId(id: string | null) {
  pendingInboxId = isValidInboxId(id) ? id : null;
}

/** Return and clear the parked inbox id. */
export function takePendingInboxId(): string | null {
  const id = pendingInboxId;
  pendingInboxId = null;
  return id;
}

/** Where to land after pairing or on launch. */
export function postPairingHref(): string {
  const id = takePendingInboxId();
  return id ? inboxItemHref(id) : '/(tabs)/inbox';
}
