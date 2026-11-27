/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { configService } from '@/common/config/configService';
import {
  CHAT_WIDTH_CONFIG_KEY,
  DEFAULT_CHAT_WIDTH,
  sanitizeChatWidth,
  type ChatWidth,
} from '@/common/config/chatWidth';
import { applyChatWidth } from '@renderer/utils/theme/applyChatWidth';

function readChatWidth(): ChatWidth {
  return sanitizeChatWidth(configService.get(CHAT_WIDTH_CONFIG_KEY));
}

// Apply the saved width as soon as settings are readable, before any chat renders.
if (typeof window !== 'undefined') {
  void configService
    .whenReady()
    .then(() => applyChatWidth(readChatWidth()))
    .catch(() => {
      // Not signed in yet (WebUI): the stylesheet default applies until settings load.
    });
}

export type UseChatWidth = {
  chatWidth: ChatWidth;
  setChatWidth: (width: ChatWidth) => Promise<void>;
};

export const useChatWidth = (): UseChatWidth => {
  const [chatWidth, setChatWidthState] = useState<ChatWidth>(DEFAULT_CHAT_WIDTH);

  useEffect(() => {
    let mounted = true;
    const sync = () => {
      if (!mounted) return;
      const next = readChatWidth();
      setChatWidthState(next);
      applyChatWidth(next);
    };
    void configService
      .whenReady()
      .then(sync)
      .catch((error) => console.error('Failed to load the chat width:', error));
    const off = configService.subscribe(CHAT_WIDTH_CONFIG_KEY, sync);
    return () => {
      mounted = false;
      off();
    };
  }, []);

  const setChatWidth = useCallback(async (width: ChatWidth) => {
    // configService.set updates the cache and notifies the subscription above,
    // which applies the width; the await only covers the write to Core.
    try {
      await configService.set(CHAT_WIDTH_CONFIG_KEY, width);
    } catch (error) {
      console.error('Failed to save the chat width:', error);
    }
  }, []);

  return { chatWidth, setChatWidth };
};
