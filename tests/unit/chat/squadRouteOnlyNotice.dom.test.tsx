import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { IMessageAcpToolCall, IMessageToolGroup } from '@/common/chat/chatLib';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o?.tool ? `${k}:${String(o.tool)}` : k),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/renderer/hooks/context/FeedbackContext', () => ({
  useFeedback: () => ({ openFeedback: vi.fn() }),
}));
vi.mock('@renderer/components/chat/CollapsibleContent', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@renderer/components/Markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@renderer/components/media/LocalImageView', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/LocalImageView', () => ({ default: () => null }));
vi.mock('@/renderer/components/base/FileChangesPanel', () => ({ default: () => null }));
vi.mock('@/renderer/utils/file/download', () => ({ downloadFileFromPath: vi.fn() }));
vi.mock('@/renderer/hooks/file/useDiffPreviewHandlers', () => ({
  useDiffPreviewHandlers: () => ({ handleFileClick: vi.fn(), handleDiffClick: vi.fn() }),
}));
vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({ workspace: '/tmp/ws' }),
}));
vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: { confirmMessage: { invoke: vi.fn() } },
    fs: { getImageBase64: { invoke: vi.fn() } },
  },
}));

import MessageAcpToolCall from '@/renderer/pages/conversation/Messages/acp/MessageAcpToolCall';
import MessageToolGroup from '@/renderer/pages/conversation/Messages/components/MessageToolGroup';

const REJECTION_TEXT = 'Squad Leader is route_only; tool team_spawn_agent is not allowed';

const acp = (
  status: IMessageAcpToolCall['content']['update']['status'],
  extra: Partial<IMessageAcpToolCall['content']['update']>
): IMessageAcpToolCall =>
  ({
    id: 'm1',
    msg_id: 'm1',
    conversation_id: 'c1',
    type: 'acp_tool_call',
    content: {
      sessionId: 's1',
      update: {
        sessionUpdate: 'tool_call_update',
        tool_call_id: 'tc1',
        status,
        title: 'mcp__aionui-team__team_spawn_agent',
        kind: 'other',
        ...extra,
      },
    },
  }) as IMessageAcpToolCall;

const group = (status: IMessageToolGroup['content'][number]['status'], result: string): IMessageToolGroup =>
  ({
    id: 'g1',
    type: 'tool_group',
    conversation_id: 'c1',
    content: [
      { call_id: 'c1', description: 'team_spawn_agent', name: 'team_spawn_agent', status, result_display: result },
    ],
  }) as unknown as IMessageToolGroup;

afterEach(() => cleanup());

describe('route_only Squad Leader rejection in chat', () => {
  it('explains a failed ACP tool call from structured rawOutput', () => {
    render(
      <MessageAcpToolCall
        message={acp('failed', {
          rawOutput: {
            code: 'permission_denied',
            message: REJECTION_TEXT,
            details: {
              code: 'squad_route_only_tool_forbidden',
              team_id: 't1',
              tool: 'team_spawn_agent',
              allowed: ['team_send_message', 'team_task_update'],
            },
          },
        })}
      />
    );
    expect(screen.getByTestId('squad-route-only-notice')).toBeInTheDocument();
    expect(screen.getByText('conversation.squadRouteOnly.body:team_spawn_agent')).toBeInTheDocument();
    expect(screen.getAllByTestId('squad-route-only-allowed').map((n) => n.textContent)).toEqual([
      'team_send_message',
      'team_task_update',
    ]);
  });

  it('explains a failed ACP tool call from its text content', () => {
    render(
      <MessageAcpToolCall
        message={acp('failed', { content: [{ type: 'content', content: { type: 'text', text: REJECTION_TEXT } }] })}
      />
    );
    expect(screen.getAllByTestId('squad-route-only-allowed')).toHaveLength(4);
  });

  it('does not annotate completed or unrelated ACP tool calls', () => {
    render(
      <MessageAcpToolCall
        message={acp('completed', { content: [{ type: 'content', content: { type: 'text', text: REJECTION_TEXT } }] })}
      />
    );
    render(
      <MessageAcpToolCall
        message={acp('failed', { content: [{ type: 'content', content: { type: 'text', text: 'ENOENT' } }] })}
      />
    );
    expect(screen.queryByTestId('squad-route-only-notice')).not.toBeInTheDocument();
  });

  it('explains an errored tool group entry and leaves others alone', () => {
    render(<MessageToolGroup message={group('Error', REJECTION_TEXT)} />);
    expect(screen.getByText('conversation.squadRouteOnly.body:team_spawn_agent')).toBeInTheDocument();
    cleanup();
    render(<MessageToolGroup message={group('Error', 'ENOENT: no such file')} />);
    render(<MessageToolGroup message={group('Success', REJECTION_TEXT)} />);
    expect(screen.queryByTestId('squad-route-only-notice')).not.toBeInTheDocument();
  });
});
