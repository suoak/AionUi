/**
 * Reconstruct model-visible chat messages from the AionCore journal transcript.
 *
 * This is WorkMate's consume path for DeepSeek Harness `deriveMessages()`:
 * when the journal can reconstruct the turn (including user/message), it is
 * the source of truth. Older AionCore builds without UserPrompt fall back to
 * DB user bubbles plus journal assistant/tool rows.
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import {
  transcriptItemText,
  type JournalTranscript,
  type JournalTranscriptItem,
} from '@/common/types/journalTranscript';

export function isModelVisibleMessage(message: TMessage): boolean {
  if (message.type === 'text') {
    return message.position !== 'right' && Boolean(message.content.content?.trim());
  }
  return message.type === 'tool_call' || message.type === 'acp_tool_call' || message.type === 'tool_group';
}

export function messagesNeedJournalHydration(messages: TMessage[]): boolean {
  return !messages.some(isModelVisibleMessage);
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
  const journalHasUser = recovered.some((message) => message.type === 'text' && message.position === 'right');
  if (journalHasUser) {
    return recovered;
  }
  return [...messages, ...recovered];
}

export async function hydrateConversationMessagesFromJournal(
  conversationId: string,
  messages: TMessage[]
): Promise<TMessage[]> {
  if (!conversationId || !messagesNeedJournalHydration(messages)) {
    return messages;
  }
  try {
    const transcript = await ipcBridge.conversation.getJournalTranscript.invoke({
      conversation_id: conversationId,
      visibility: 'model',
    });
    if (!transcript?.items?.length) {
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
