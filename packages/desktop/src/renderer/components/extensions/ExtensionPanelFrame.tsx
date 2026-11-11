/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useExtensionAssetSessionUrl } from '@/renderer/hooks/system/useExtensionAssetSessionUrl';
import {
  EXTENSION_PANEL_IFRAME_SANDBOX,
  isLocalExtensionAssetPath,
} from '@/renderer/hooks/system/extensionPanelCatalog';

export type ExtensionPanelFrameProps = {
  id: string;
  title: string;
  extensionName: string;
  entryPoint: string;
};

/**
 * Product host for a plugin panel / work-panel view.
 *
 * Loads the entry through the verified asset-token / asset-serve channel
 * (`useExtensionAssetSessionUrl`). The iframe is an opaque origin
 * (`sandbox="allow-scripts"` only): no `allow-same-origin`, no top navigation,
 * and no host postMessage bridge in v1. Remote / non-asset entries are refused.
 */
export const ExtensionPanelFrame: React.FC<ExtensionPanelFrameProps> = ({ id, title, extensionName, entryPoint }) => {
  const { t } = useTranslation();
  const hostable = isLocalExtensionAssetPath(entryPoint);
  const resolvedUrl = useExtensionAssetSessionUrl(hostable ? entryPoint : undefined, extensionName);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
  }, [resolvedUrl]);

  if (!hostable) {
    return (
      <div
        className='w-full h-full flex items-center justify-center px-16px text-center text-t-secondary text-13px'
        data-testid='extension-panel-frame'
        data-panel-id={id}
        data-panel-unavailable='true'
      >
        {t(
          'common.extensionPanels.unavailable',
          "This panel isn't available. CSBU WorkMate can only host a verified extension asset."
        )}
      </div>
    );
  }

  return (
    <div className='relative w-full h-full min-h-0' data-testid='extension-panel-frame' data-panel-id={id}>
      {loading && (
        <div className='absolute inset-0 flex items-center justify-center text-t-secondary text-13px'>
          <span className='animate-pulse'>{t('common.extensionPanels.loading', 'Loading panel…')}</span>
        </div>
      )}
      <iframe
        key={id}
        src={resolvedUrl}
        title={title}
        sandbox={EXTENSION_PANEL_IFRAME_SANDBOX}
        referrerPolicy='no-referrer'
        onLoad={() => {
          // No src yet while the asset token is in flight; ignore about:blank.
          if (resolvedUrl) setLoading(false);
        }}
        className='w-full h-full border-none'
        style={{
          opacity: loading ? 0 : 1,
          transition: 'opacity 150ms ease-in',
        }}
        data-testid='extension-panel-iframe'
      />
    </div>
  );
};

export default ExtensionPanelFrame;
