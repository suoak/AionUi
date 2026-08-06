/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UpdateInfo } from 'electron-updater';
import { verify } from 'crypto';
import { GenericProvider } from 'electron-updater/out/providers/GenericProvider';
import { parseUpdateInfo, resolveFiles as resolveProviderFiles } from 'electron-updater/out/providers/Provider';
import { getChannelFilename, newUrlFromBase } from 'electron-updater/out/util';
import log from 'electron-log';

type GenericProviderConfiguration = ConstructorParameters<typeof GenericProvider>[0];
type GenericProviderUpdater = ConstructorParameters<typeof GenericProvider>[1];
type GenericProviderRuntimeOptions = ConstructorParameters<typeof GenericProvider>[2];

export type CdnGenericProviderConfiguration = Omit<GenericProviderConfiguration, 'provider'> & {
  provider: 'custom';
  manifestPublicKey: string;
  updateProvider?: unknown;
};

const withTrailingSlash = (url: string): string => (url.endsWith('/') ? url : `${url}/`);

export class CdnGenericProvider extends GenericProvider {
  private readonly _cdnBaseUrl: URL;
  // Parent stores `updater` privately; keep our own reference to rebuild the
  // channel-file URL for logging (the base `channel` getter is also private).
  private readonly _updater: GenericProviderUpdater;
  private readonly _manifestPublicKey: string;

  protected async requestInternalResource(url: URL, method: 'GET' | 'HEAD' = 'GET'): Promise<string> {
    let currentUrl = url;
    const basePath = this._cdnBaseUrl.pathname.replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      for (let redirectCount = 0; redirectCount <= 8; redirectCount += 1) {
        if (currentUrl.origin !== this._cdnBaseUrl.origin || !currentUrl.pathname.startsWith(`${basePath}/`)) {
          const error = new Error('Internal update redirect left the configured origin or release path') as Error & {
            code?: string;
          };
          error.code = 'ERR_UPDATER_REDIRECT_REJECTED';
          throw error;
        }

        let response: Response;
        try {
          response = await fetch(currentUrl, {
            method,
            redirect: 'manual',
            signal: controller.signal,
            headers: { 'Cache-Control': 'no-cache' },
          });
        } catch (cause) {
          const source = cause as Error & { cause?: { code?: string }; code?: string };
          const error = new Error(source.message, { cause }) as Error & { code?: string };
          error.code = source.code ?? source.cause?.code ?? (source.name === 'AbortError' ? 'ETIMEDOUT' : undefined);
          throw error;
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) {
            const error = new Error('Internal update redirect has no Location header') as Error & { code?: string };
            error.code = 'ERR_UPDATER_REDIRECT_REJECTED';
            throw error;
          }
          currentUrl = new URL(location, currentUrl);
          continue;
        }
        if (!response.ok) {
          const error = new Error(`Internal update request failed with HTTP ${response.status}`) as Error & {
            statusCode?: number;
          };
          error.statusCode = response.status;
          throw error;
        }
        return method === 'HEAD' ? '' : response.text();
      }

      const error = new Error('Internal update source returned too many redirects') as Error & { code?: string };
      error.code = 'ERR_UPDATER_REDIRECT_REJECTED';
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  constructor(
    configuration: CdnGenericProviderConfiguration,
    updater: GenericProviderUpdater,
    runtimeOptions: GenericProviderRuntimeOptions
  ) {
    const genericConfiguration: GenericProviderConfiguration = {
      ...configuration,
      provider: 'generic',
    };
    super(genericConfiguration, updater, runtimeOptions);
    this._updater = updater;
    this._manifestPublicKey = configuration.manifestPublicKey.replace(/\\n/g, '\n');
    this._cdnBaseUrl = new URL(withTrailingSlash(configuration.url));
    log.debug('[auto-update] CDN provider initialized', {
      baseUrl: this._cdnBaseUrl.href,
      platform: runtimeOptions.platform,
      isUseMultipleRangeRequest: runtimeOptions.isUseMultipleRangeRequest,
    });
  }

  /**
   * Resolve the channel metadata file (e.g. `latest-mac.yml`) the updater fetches
   * to discover the newest version. Mirrors GenericProvider's private `channel`
   * getter, which is not accessible from a subclass.
   */
  private resolveLatestVersionUrl(): URL {
    const channelName = this._updater.channel ?? this.getDefaultChannelName();
    const channelFile = getChannelFilename(channelName);
    // `isAddNoCacheQuery` is a real getter on AppUpdater but absent from its public types.
    const addNoCacheQuery = Boolean((this._updater as unknown as { isAddNoCacheQuery?: boolean }).isAddNoCacheQuery);
    return newUrlFromBase(channelFile, this._cdnBaseUrl, addNoCacheQuery);
  }

  override async getLatestVersion(): Promise<UpdateInfo> {
    const manifestUrl = this.resolveLatestVersionUrl();
    const signatureUrl = new URL(manifestUrl);
    signatureUrl.pathname = `${signatureUrl.pathname}.sig`;
    log.info('[auto-update] Checking signed latest version from URL:', manifestUrl.href);

    const [rawManifest, rawSignature] = await Promise.all([
      this.requestInternalResource(manifestUrl),
      this.requestInternalResource(signatureUrl),
    ]);
    if (!rawManifest || !rawSignature) {
      throw new Error('Internal update manifest or signature is empty');
    }

    let signature: Buffer;
    try {
      signature = Buffer.from(rawSignature.trim(), 'base64');
    } catch {
      signature = Buffer.alloc(0);
    }
    if (!signature.length || !verify(null, Buffer.from(rawManifest, 'utf8'), this._manifestPublicKey, signature)) {
      const error = new Error('Internal update manifest signature verification failed') as Error & { code?: string };
      error.code = 'ERR_UPDATER_MANIFEST_SIGNATURE_INVALID';
      throw error;
    }

    const channelFile = manifestUrl.pathname.split('/').pop() || 'latest.yml';
    const updateInfo = parseUpdateInfo(rawManifest, channelFile, manifestUrl);
    const artifactFiles = resolveProviderFiles(
      updateInfo,
      this._cdnBaseUrl,
      (filePath) => `${updateInfo.version}/${filePath}`
    );
    await Promise.all(artifactFiles.map((file) => this.requestInternalResource(file.url, 'HEAD')));
    return updateInfo;
  }

  override resolveFiles(updateInfo: UpdateInfo): ReturnType<GenericProvider['resolveFiles']> {
    const resolved = resolveProviderFiles(
      updateInfo,
      this._cdnBaseUrl,
      (filePath) => `${updateInfo.version}/${filePath}`
    );
    log.info('[auto-update] Update download URL(s) resolved:', {
      version: updateInfo.version,
      files: resolved.map((file) => file.url.href),
      packages: resolved.map((file) => file.packageInfo?.path).filter(Boolean),
    });
    return resolved;
  }
}
