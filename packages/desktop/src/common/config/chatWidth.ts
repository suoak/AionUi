/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reading width of the conversation column (messages, plan bar and composer),
 * chosen in Appearance settings and persisted under `ui.chatWidth`.
 *
 * The cap only applies once the chat column is wide enough for side gutters
 * (see `.chat-surface-fluid` in messages.css); narrow columns such as team
 * parallel view stay full width whatever is chosen.
 */
export const CHAT_WIDTHS = ['standard', 'wide', 'full'] as const;
export type ChatWidth = (typeof CHAT_WIDTHS)[number];

export const DEFAULT_CHAT_WIDTH: ChatWidth = 'standard';
export const CHAT_WIDTH_CONFIG_KEY = 'ui.chatWidth' as const;
export const CHAT_WIDTH_CSS_VAR = '--wm-chat-max-width';

/** Maximum column width; `none` lets the column fill the space between gutters. */
export const CHAT_WIDTH_MAX: Record<ChatWidth, string> = {
  standard: '760px',
  wide: '960px',
  full: 'none',
};

export function sanitizeChatWidth(value: unknown): ChatWidth {
  return typeof value === 'string' && (CHAT_WIDTHS as readonly string[]).includes(value)
    ? (value as ChatWidth)
    : DEFAULT_CHAT_WIDTH;
}
