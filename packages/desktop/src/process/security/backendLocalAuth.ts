/**
 * Attach the per-launch local API secret to the app's own requests to aioncore.
 *
 * aioncore (local mode) only treats a request as the desktop user when it
 * carries `x-aionui-local-secret`. Instead of exposing the secret to renderer
 * JavaScript, the main process injects it at the network layer — and only for
 * requests that originate from the app's own renderer frames. Agent-generated
 * HTML previews, extension webviews, OAuth windows and any other web content
 * never receive it, so they cannot drive the local API.
 */

import type { OnBeforeSendHeadersListenerDetails, Session, WebContents, WebFrameMain } from 'electron';

export const LOCAL_API_SECRET_HEADER = 'x-aionui-local-secret';

/** Resource types a PDF/media `<webview>` uses to stream a backend file. */
const WEBVIEW_STREAM_RESOURCE_TYPES = new Set(['mainFrame', 'object', 'media', 'other']);

export type LocalSecretRequest = {
  url: string;
  method: string;
  resourceType: string;
  /** `'window'` for BrowserWindows, `'webview'` for `<webview>` guests, … */
  webContentsType?: string;
  /** URL currently loaded in the webContents' main frame. */
  mainFrameUrl?: string;
  /** Whether the requesting frame is the webContents' top-level frame. */
  isMainFrame: boolean;
  /** Serialized origin of the requesting frame (`'null'` when opaque). */
  frameOrigin?: string;
  /** Serialized origin of the webContents' main frame. */
  mainFrameOrigin?: string;
};

export type LocalSecretContext = {
  backendPort: number;
  /** URL prefixes of the app's own renderer pages (dev server / packaged files). */
  trustedRendererPrefixes: string[];
};

function parseBackendUrl(raw: string, port: number): URL | null {
  if (!port) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!['http:', 'ws:'].includes(url.protocol)) return null;
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return null;
  if (url.port !== String(port)) return null;
  return url;
}

function normalizeUrlForPrefix(raw: string): string {
  let value = raw;
  try {
    value = decodeURI(raw);
  } catch {
    // keep raw
  }
  // Windows drive letters / percent-encoding differ between pathToFileURL and
  // Chromium's loaded URL; compare case-insensitively with `\` folded.
  return value.replace(/\\/g, '/').toLowerCase();
}

function isTrustedRendererUrl(url: string | undefined, prefixes: string[]): boolean {
  if (!url) return false;
  const normalized = normalizeUrlForPrefix(url);
  return prefixes.some((prefix) => prefix.length > 0 && normalized.startsWith(normalizeUrlForPrefix(prefix)));
}

/**
 * Static files an installed extension serves for its settings tab. The tab is
 * an iframe whose document comes from the backend origin, so its own
 * scripts/styles/images are cross-origin to the renderer; they still need the
 * secret to load. Only GETs of this asset tree qualify — never other API
 * routes, so the extension page cannot drive the local API.
 */
const EXTENSION_ASSET_PATH = /^\/api\/extensions\/[^/]+\/assets\//;

/** Pure policy: should this request carry the local API secret? */
export function shouldAttachLocalSecret(req: LocalSecretRequest, ctx: LocalSecretContext): boolean {
  const target = parseBackendUrl(req.url, ctx.backendPort);
  if (!target) return false;

  if (req.webContentsType === 'window') {
    // Only app windows that are showing the app's own renderer.
    if (!isTrustedRendererUrl(req.mainFrameUrl, ctx.trustedRendererPrefixes)) return false;
    if (req.isMainFrame) return true;
    // Same-origin child frames of the renderer (non-opaque origin only).
    if (req.frameOrigin && req.frameOrigin !== 'null' && req.frameOrigin === req.mainFrameOrigin) return true;
    if (req.method === 'GET' && target.protocol === 'http:' && EXTENSION_ASSET_PATH.test(target.pathname)) return true;
    // An iframe document the renderer embeds from the backend (read-only GET
    // navigation). Its own scripts are cross-origin to the renderer and get no
    // header for their subresource/XHR requests.
    return req.resourceType === 'subFrame' && req.method === 'GET';
  }

  if (req.webContentsType === 'webview') {
    // PDF/media previews stream files straight from the backend. Allow only
    // the byte-stream GET, never script-initiated requests from the guest.
    return (
      req.method === 'GET' &&
      target.protocol === 'http:' &&
      target.pathname === '/api/fs/stream' &&
      WEBVIEW_STREAM_RESOURCE_TYPES.has(req.resourceType)
    );
  }

  return false;
}

function describeRequest(details: OnBeforeSendHeadersListenerDetails): LocalSecretRequest {
  const webContents: WebContents | undefined = details.webContents ?? undefined;
  let mainFrame: WebFrameMain | undefined;
  let frame: WebFrameMain | null | undefined;
  try {
    mainFrame = webContents && !webContents.isDestroyed() ? webContents.mainFrame : undefined;
    frame = details.frame;
  } catch {
    mainFrame = undefined;
    frame = undefined;
  }
  const isMainFrame =
    !!frame && !!mainFrame && frame.processId === mainFrame.processId && frame.routingId === mainFrame.routingId;
  let frameOrigin: string | undefined;
  let mainFrameOrigin: string | undefined;
  try {
    frameOrigin = frame?.origin;
    mainFrameOrigin = mainFrame?.origin;
  } catch {
    // Frame disposed mid-request: leave origins undefined (no header).
  }
  return {
    url: details.url,
    method: details.method,
    resourceType: details.resourceType,
    webContentsType: webContents && !webContents.isDestroyed() ? webContents.getType() : undefined,
    mainFrameUrl: mainFrame?.url,
    isMainFrame,
    frameOrigin,
    mainFrameOrigin,
  };
}

export type InstallBackendLocalAuthOptions = {
  getBackendPort: () => number;
  getLocalSecret: () => string | null;
  trustedRendererPrefixes: string[];
};

/**
 * Install the header-injection hook on `targetSession`. Electron allows a
 * single `onBeforeSendHeaders` listener per session; nothing else in the app
 * registers one.
 */
export function installBackendLocalAuth(targetSession: Session, opts: InstallBackendLocalAuthOptions): void {
  targetSession.webRequest.onBeforeSendHeaders(
    { urls: ['http://127.0.0.1/*', 'ws://127.0.0.1/*', 'http://localhost/*', 'ws://localhost/*'] },
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders };
      // Never let web content smuggle its own value through.
      for (const name of Object.keys(requestHeaders)) {
        if (name.toLowerCase() === LOCAL_API_SECRET_HEADER) delete requestHeaders[name];
      }
      try {
        const secret = opts.getLocalSecret();
        if (
          secret &&
          shouldAttachLocalSecret(describeRequest(details), {
            backendPort: opts.getBackendPort(),
            trustedRendererPrefixes: opts.trustedRendererPrefixes,
          })
        ) {
          requestHeaders[LOCAL_API_SECRET_HEADER] = secret;
        }
      } catch (error) {
        console.warn(
          '[CSBU WorkMate] backend auth header hook failed:',
          error instanceof Error ? error.message : error
        );
      }
      callback({ requestHeaders });
    }
  );
}
