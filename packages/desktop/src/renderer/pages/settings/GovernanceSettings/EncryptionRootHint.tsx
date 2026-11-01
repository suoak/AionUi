/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { EncryptionRootStatus } from '@/common/types/encryptionRoot';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { getEncryptionRootHint } from './encryptionRootModel';

/**
 * Desktop-only hint about the system-keychain copy of the storage encryption key (M8 E12-6).
 * Renders nothing in the browser WebUI, while loading, or if the status call fails.
 */
const EncryptionRootHint: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<EncryptionRootStatus | null>(null);
  const desktop = isElectronDesktop();

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    // Any failure (older preload, no provider) just hides the hint.
    Promise.resolve()
      .then(() => ipcBridge.application.getEncryptionRootStatus.invoke())
      .then((value) => {
        if (!cancelled) setStatus(value ?? null);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [desktop]);

  const hint = desktop ? getEncryptionRootHint(status) : null;
  if (!hint) return null;
  return (
    <Alert
      type={hint.type}
      data-testid='governance-encryption-root'
      data-state={status?.state}
      title={t('settings.governance.encryptionRoot.title')}
      content={
        <>
          <div>{t(hint.messageKey)}</div>
          {hint.staleNoteKey ? <div>{t(hint.staleNoteKey)}</div> : null}
        </>
      }
    />
  );
};

export default EncryptionRootHint;
