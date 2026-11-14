/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { collectErrorText, extensionReasonI18nKey, findExtensionReasonCodeIn } from '@/renderer/extensions/reasonCodes';

export type ExtensionReasonMessageProps = {
  /** Raw backend text, error, hub `msg`, or tool `reason`. */
  raw: unknown;
  /** Shown when no catalogue code is present. Defaults to the raw text. */
  fallback?: string;
  className?: string;
};

/**
 * Friendly localized hint for a catalogue reason code, with the raw code kept
 * as secondary support text. Falls back to the original message when no code
 * is found.
 */
export const ExtensionReasonMessage: React.FC<ExtensionReasonMessageProps> = ({ raw, fallback, className }) => {
  const { t } = useTranslation();
  const text = collectErrorText(raw);
  const code = findExtensionReasonCodeIn(raw);
  const hint = code ? t(extensionReasonI18nKey(code)) : (fallback ?? text);

  return (
    <span className={className} data-testid='extension-reason-message'>
      <span data-testid='extension-reason-hint'>{hint}</span>
      {code ? (
        <span className='mt-4px block text-11px text-t-secondary font-mono' data-testid='extension-reason-code'>
          {t('common.extensionReasonCodes.supportCode', { code })}
        </span>
      ) : null}
    </span>
  );
};

export const ExtensionAssetRefusal: React.FC<{ raw: string; className?: string }> = ({ raw, className }) => {
  const { t } = useTranslation();
  return (
    <div
      className={
        className ?? 'w-full h-full flex items-center justify-center px-16px text-center text-t-secondary text-13px'
      }
      data-testid='extension-asset-refused'
    >
      <ExtensionReasonMessage raw={raw} fallback={t('common.extensionPanels.loadFailed')} />
    </div>
  );
};

export default ExtensionReasonMessage;
