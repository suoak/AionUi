/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CHAT_WIDTH_CSS_VAR, CHAT_WIDTH_MAX, type ChatWidth } from '@/common/config/chatWidth';

/** Write the conversation column width to the root element's CSS variable. */
export function applyChatWidth(width: ChatWidth, root: Document = document): void {
  root.documentElement.style.setProperty(CHAT_WIDTH_CSS_VAR, CHAT_WIDTH_MAX[width]);
}
