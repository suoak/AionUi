/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { assistantMentionText, filterAssistantMentions } from '@/renderer/utils/chat/assistantMention';

const a = (id: string, name: string, extra: Partial<Assistant> = {}) =>
  ({ id, name, enabled: true, ...extra }) as Assistant;
const LIST = [
  a('1', 'Writer'),
  a('2', 'Code Reviewer'),
  a('3', 'Researcher'),
  a('4', 'Off', { enabled: false }),
  a('5', 'Slides'),
];

describe('filterAssistantMentions', () => {
  it('shows the first few enabled assistants for an empty query', () => {
    expect(filterAssistantMentions(LIST, '', 'en-US').map((x) => x.id)).toEqual(['1', '2', '3']);
  });

  it('ranks name prefixes before substrings and drops disabled ones', () => {
    expect(filterAssistantMentions(LIST, 're', 'en-US').map((x) => x.name)).toEqual(['Researcher', 'Code Reviewer']);
    expect(filterAssistantMentions(LIST, 'off', 'en-US')).toEqual([]);
  });

  it('can leave out this conversation’s own assistant', () => {
    expect(filterAssistantMentions(LIST, 'wri', 'en-US', { excludeId: '1' })).toEqual([]);
  });

  it('inserts @Name', () => {
    expect(assistantMentionText({ name: 'Code Reviewer' })).toBe('@Code Reviewer');
  });
});
