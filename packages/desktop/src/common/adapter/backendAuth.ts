/**
 * Trusted host-process authentication for the local aioncore backend.
 *
 * The Electron main process owns the per-launch local API secret (minted by
 * the backend launcher and handed to aioncore over stdin). Main-process callers
 * of the backend read the auth headers through the provider registered here;
 * renderer code never sees the secret — its requests are authenticated by the
 * main process's `webRequest` hook (see process/security/backendLocalAuth.ts).
 */

type BackendAuthHeadersProvider = () => Record<string, string>;

type BackendAuthGlobal = typeof globalThis & {
  __backendAuthHeaders?: BackendAuthHeadersProvider;
};

/** Register the main-process provider of backend auth headers. */
export function setBackendAuthHeadersProvider(provider: BackendAuthHeadersProvider | undefined): void {
  (globalThis as BackendAuthGlobal).__backendAuthHeaders = provider;
}

/**
 * Headers authenticating a main-process call to the backend. Empty in the
 * renderer, in WebUI browser mode, and before the backend has started.
 */
export function getBackendAuthHeaders(): Record<string, string> {
  if (typeof window !== 'undefined') return {};
  try {
    return (globalThis as BackendAuthGlobal).__backendAuthHeaders?.() ?? {};
  } catch {
    return {};
  }
}
