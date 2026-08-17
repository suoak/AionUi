/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import {
  buildMessageIndex,
  composeMessageWithIndex,
  mergeLoadedPageWithCurrent,
} from '@/renderer/pages/conversation/Messages/hooks';

const liveUser = (id: string, content: string): TMessage =>
  ({
    id,
    msg_id: id,
    conversation_id: 'conv-1',
    type: 'text',
    position: 'right',
    content: { content },
  }) as TMessage;

const journalUser = (eventId: string, content: string): TMessage =>
  ({
    id: `journal:${eventId}`,
    msg_id: eventId,
    conversation_id: 'conv-1',
    type: 'text',
    position: 'right',
    content: { content },
  }) as TMessage;

const assistant = (id: string, content: string): TMessage =>
  ({
    id,
    msg_id: id,
    conversation_id: 'conv-1',
    type: 'text',
    position: 'left',
    content: { content },
  }) as TMessage;

const compose = (list: TMessage[], message: TMessage): TMessage[] =>
  composeMessageWithIndex(message, list, buildMessageIndex(list));

describe('new-conversation user bubble dedupe', () => {
  it('does not append the journal clone after the live userCreated row', () => {
    const list = compose(compose([], liveUser('u1', '你好')), journalUser('evt-user', '你好'));
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('u1');
  });

  it('does not append the live userCreated row after a journal reconstruction', () => {
    const list = compose(compose([], journalUser('evt-user', '你好')), liveUser('u1', '你好'));
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('journal:evt-user');
  });

  it('keeps a later turn that repeats the same user text', () => {
    const list = [liveUser('u1', '你好'), assistant('a1', '你好！'), liveUser('u2', '你好')];
    expect(compose(list.slice(0, 2), liveUser('u2', '你好'))).toHaveLength(3);
  });

  it('folds a journal page into the live userCreated row', () => {
    const merged = mergeLoadedPageWithCurrent('conv-1', [journalUser('evt-user', '你好')], [liveUser('u1', '你好')]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('u1');
  });

  it('keeps live-only assistant frames that the page has not persisted yet', () => {
    const merged = mergeLoadedPageWithCurrent(
      'conv-1',
      [journalUser('evt-user', '你好')],
      [liveUser('u1', '你好'), assistant('a-live', 'working')]
    );
    expect(merged.map((message) => message.id)).toEqual(['u1', 'a-live']);
  });
});
