/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationToolSurface } from '@/common/adapter/ipcBridge';
import { Tooltip } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useConversationToolSurface } from '../components/ToolSurface/useConversationToolSurface';

export type SlotMcpNotice = { kind: 'external'; servers: string[] } | { kind: 'unknown' } | null;

/**
 * Design E3-5 ②: a fan-out slot whose backend may mount machine MCP servers
 * gets a yellow notice, driven by the tool surface the agent reported. Strict
 * surfaces and slots that have not reported stay quiet.
 */
export const slotMcpNotice = (surface: IConversationToolSurface | undefined): SlotMcpNotice => {
  if (!surface) return null;
  const external = surface.external_mcp_servers ?? [];
  if (external.length > 0) return { kind: 'external', servers: external };
  if (surface.mcp_isolation === 'ambient') return { kind: 'unknown' };
  return null;
};

const FanoutSlotMcpNotice: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const { t } = useTranslation();
  const state = useConversationToolSurface(conversationId);
  const notice = slotMcpNotice(state.status === 'reported' ? state.surface : undefined);
  if (!notice) return null;
  const text =
    notice.kind === 'external'
      ? t('conversation.fanout.externalMcp', { count: notice.servers.length })
      : t('conversation.fanout.ambientMcp');
  const tip = notice.kind === 'external' ? notice.servers.join(', ') : t('conversation.fanout.ambientMcpTip');
  return (
    <Tooltip content={tip}>
      <span
        className='self-start rd-4px bg-warning-1 px-6px py-2px text-11px text-warning-6'
        data-testid='fanout-slot-mcp-notice'
      >
        {text}
      </span>
    </Tooltip>
  );
};

export default FanoutSlotMcpNotice;
