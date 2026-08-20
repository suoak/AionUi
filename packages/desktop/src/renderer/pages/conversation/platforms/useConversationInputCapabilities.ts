/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ConversationInputMode, IConversationCapabilities } from '@/common/adapter/ipcBridge';
import { Message } from '@arco-design/web-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const isInputModeSupported = (mode: ConversationInputMode, capabilities: IConversationCapabilities): boolean =>
  mode === 'followup' || (mode === 'steer' && capabilities.steer) || (mode === 'inject' && capabilities.inject);

export const useConversationInputCapabilities = (conversation_id: string) => {
  const { t } = useTranslation();
  const [capabilities, setCapabilities] = useState<IConversationCapabilities | null>(null);
  const [inputMode, setInputMode] = useState<ConversationInputMode>('followup');

  useEffect(() => {
    setCapabilities(null);
    setInputMode('followup');

    const getCapabilities = ipcBridge.conversation.getCapabilities;
    if (!getCapabilities) return;

    let active = true;
    void getCapabilities
      .invoke({ conversation_id })
      .then((next) => {
        if (active) setCapabilities(next);
      })
      .catch(() => {
        if (active) setCapabilities(null);
      });
    return () => {
      active = false;
    };
  }, [conversation_id]);

  useEffect(() => {
    if (!ipcBridge.conversation.capabilitiesChanged?.on) return;
    return ipcBridge.conversation.capabilitiesChanged.on((event) => {
      if (event.conversation_id !== conversation_id) return;
      setCapabilities(event.capabilities);
      setInputMode((current) => {
        if (isInputModeSupported(current, event.capabilities)) return current;
        Message.info(
          t('conversation.commandQueue.capabilityChanged', {
            defaultValue: 'The selected input mode is no longer supported. Switched to Followup.',
          })
        );
        return 'followup';
      });
    });
  }, [conversation_id, t]);

  return {
    capabilities,
    inputMode,
    setInputMode,
    hasAlternateInputModes: Boolean(capabilities?.steer || capabilities?.inject),
  };
};
