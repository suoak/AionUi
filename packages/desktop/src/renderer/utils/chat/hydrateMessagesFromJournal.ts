/**
 * Reconstruct model-visible chat messages from the AionCore journal transcript.
 *
 * When the journal can reconstruct the turn (including user/message), it is
 * the source of truth. Older AionCore builds without UserPrompt fall back to
 * DB user bubbles plus journal assistant/tool rows.
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import {
  normalizeJournalTranscript,
  transcriptItemText,
  type JournalTranscript,
  type JournalTranscriptItem,
} from '@/common/types/journalTranscript';

export function isUserTextMessage(message: Pick<TMessage, 'type' | 'position'>): boolean {
  return message.type === 'text' && message.position === 'right';
}

export function userTextContent(message: TMessage): string | undefined {
  if (!isUserTextMessage(message) || message.type !== 'text') {
    return undefined;
  }
  return message.content.content ?? '';
}

export function isJournalDerivedMessage(message: Pick<TMessage, 'id'>): boolean {
  return message.id.startsWith('journal:');
}

/** Live `message.userCreated` and a journal reconstruction of the same prompt. */
export function isLiveJournalUserClone(left: TMessage, right: TMessage): boolean {
  const leftText = userTextContent(left);
  const rightText = userTextContent(right);
  if (leftText === undefined || leftText !== rightText) {
    return false;
  }
  return isJournalDerivedMessage(left) !== isJournalDerivedMessage(right);
}

export function isModelVisibleMessage(message: TMessage): boolean {
  if (message.type === 'text') {
    return message.position !== 'right' && Boolean(message.content.content?.trim());
  }
  return message.type === 'tool_call' || message.type === 'acp_tool_call' || message.type === 'tool_group';
}

export function messagesNeedJournalHydration(messages: TMessage[]): boolean {
  return !messages.some(isModelVisibleMessage);
}

function isUnfinishedMessage(message: TMessage): boolean {
  return message.status === 'pending' || message.status === 'work';
}

function assistantText(message: TMessage): string | undefined {
  if (message.type !== 'text' || message.position === 'right') {
    return undefined;
  }
  return message.content.content ?? '';
}

function toolCallId(message: TMessage): string | undefined {
  if (message.type === 'tool_call') {
    return message.content.call_id;
  }
  if (message.type === 'acp_tool_call') {
    return message.content.update.tool_call_id;
  }
  if (message.type === 'tool_group') {
    return message.content.find((item) => item.call_id)?.call_id;
  }
  return undefined;
}

function textsLooselyEqual(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.startsWith(right) || right.startsWith(left);
}

function overlayJournalMessage(recovered: TMessage, db: TMessage): TMessage {
  if (isUnfinishedMessage(db)) {
    return db;
  }
  return {
    ...recovered,
    id: db.id,
    msg_id: db.msg_id ?? recovered.msg_id,
    conversation_id: db.conversation_id,
    created_at: db.created_at ?? recovered.created_at,
    status: db.status ?? recovered.status,
    hidden: db.hidden,
    backend_turn_id: db.backend_turn_id ?? recovered.backend_turn_id,
  };
}

function findMatchingDbMessage(messages: TMessage[], recovered: TMessage, usedIds: Set<string>): TMessage | undefined {
  const candidates = messages.filter((message) => !usedIds.has(message.id));
  const byIdentity = candidates.find(
    (message) =>
      message.id === recovered.id ||
      Boolean(recovered.msg_id && (message.msg_id === recovered.msg_id || message.id === `journal:${recovered.msg_id}`))
  );
  if (byIdentity) {
    return byIdentity;
  }

  const recoveredToolId = toolCallId(recovered);
  if (recoveredToolId) {
    return candidates.find((message) => toolCallId(message) === recoveredToolId);
  }

  const recoveredText = assistantText(recovered);
  if (recoveredText === undefined) {
    return undefined;
  }
  return candidates.find((message) => {
    const text = assistantText(message);
    return text !== undefined && textsLooselyEqual(text, recoveredText);
  });
}

/** True when the live/DB list already shows this reconstructed model-visible row. */
export function isJournalMessageAlreadyShown(existing: TMessage[], candidate: TMessage): boolean {
  if (
    existing.some(
      (message) => message.id === candidate.id || Boolean(candidate.msg_id && message.msg_id === candidate.msg_id)
    )
  ) {
    return true;
  }
  if (existing.some((message) => isLiveJournalUserClone(message, candidate))) {
    return true;
  }
  const recoveredToolId = toolCallId(candidate);
  if (recoveredToolId && existing.some((message) => toolCallId(message) === recoveredToolId)) {
    return true;
  }
  const recoveredText = assistantText(candidate);
  return (
    recoveredText !== undefined &&
    existing.some((message) => {
      const text = assistantText(message);
      return text !== undefined && textsLooselyEqual(text, recoveredText);
    })
  );
}

export function messagesFromJournalTranscript(conversationId: string, transcript: JournalTranscript): TMessage[] {
  return transcript.items
    .filter((item) => item.visibility === 'model')
    .map((item) => transcriptItemToMessage(conversationId, item));
}

export function mergeDbWithJournalTranscript(messages: TMessage[], recovered: TMessage[]): TMessage[] {
  if (!recovered.length) {
    return messages;
  }

  const usedIds = new Set<string>();
  const dbUsers = messages.filter(isUserTextMessage);
  let dbUserIndex = 0;
  const backbone: TMessage[] = [];

  for (const item of recovered) {
    if (isUserTextMessage(item) && dbUserIndex < dbUsers.length) {
      const dbUser = dbUsers[dbUserIndex];
      dbUserIndex += 1;
      usedIds.add(dbUser.id);
      backbone.push(overlayJournalMessage(item, dbUser));
      continue;
    }
    const match = findMatchingDbMessage(messages, item, usedIds);
    if (match) {
      usedIds.add(match.id);
      backbone.push(overlayJournalMessage(item, match));
    } else {
      backbone.push(item);
    }
  }

  if (!messages.length) {
    return backbone;
  }

  const result: TMessage[] = [];
  let backboneIndex = 0;
  for (const message of messages) {
    if (!usedIds.has(message.id)) {
      result.push(message);
      continue;
    }
    while (backboneIndex < backbone.length && backbone[backboneIndex].id !== message.id) {
      if (!usedIds.has(backbone[backboneIndex].id)) {
        result.push(backbone[backboneIndex]);
      }
      backboneIndex += 1;
    }
    if (backboneIndex < backbone.length && backbone[backboneIndex].id === message.id) {
      result.push(backbone[backboneIndex]);
      backboneIndex += 1;
    }
  }
  while (backboneIndex < backbone.length) {
    result.push(backbone[backboneIndex]);
    backboneIndex += 1;
  }
  return result;
}

export async function hydrateConversationMessagesFromJournal(
  conversationId: string,
  messages: TMessage[]
): Promise<TMessage[]> {
  if (!conversationId) {
    return messages;
  }
  try {
    const transcript = normalizeJournalTranscript(
      await ipcBridge.conversation.getJournalTranscript.invoke({
        conversation_id: conversationId,
        visibility: 'model',
      }),
      conversationId
    );
    if (!transcript.items.length) {
      return messages;
    }
    const recovered = messagesFromJournalTranscript(conversationId, transcript);
    return mergeDbWithJournalTranscript(messages, recovered);
  } catch {
    // Older AionCore builds do not expose /transcript; keep the DB projection.
    return messages;
  }
}

function transcriptItemToMessage(conversationId: string, item: JournalTranscriptItem): TMessage {
  const id = `journal:${item.event_id}`;
  const text = transcriptItemText(item);
  if (item.transcript_kind === 'tool/call') {
    return {
      id,
      msg_id: item.event_id,
      conversation_id: conversationId,
      type: 'tool_call',
      position: 'left',
      status: 'finish',
      created_at: item.sequence,
      content: {
        call_id: item.event_id,
        name: item.summary || item.journal_kind,
        args: {},
        status: 'completed',
        description: text,
      },
    };
  }
  return {
    id,
    msg_id: item.event_id,
    conversation_id: conversationId,
    type: 'text',
    position: item.transcript_kind === 'user/message' ? 'right' : 'left',
    status: 'finish',
    created_at: item.sequence,
    content: {
      content: text,
    },
  };
}
