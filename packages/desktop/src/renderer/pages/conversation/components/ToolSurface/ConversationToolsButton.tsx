/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IToolSurfaceEntry } from '@/common/adapter/ipcBridge';
import { iconColors } from '@/renderer/styles/colors';
import { Alert, Button, Drawer, Empty, Tag, Tooltip } from '@arco-design/web-react';
import { Toolkit } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { groupToolSurface, type McpStatusTone, type ToolSurfaceMcpGroup } from './toolSurfaceModel';
import { useConversationToolSurface, type ConversationToolSurfaceState } from './useConversationToolSurface';

const TONE_COLOR: Record<McpStatusTone, string> = {
  ok: 'green',
  failed: 'red',
  missing: 'red',
  disabled: 'gray',
  unknown: 'gray',
};

const ToolNameList: React.FC<{ entries: IToolSurfaceEntry[]; testId: string }> = ({ entries, testId }) => {
  const { t } = useTranslation();
  if (entries.length === 0) {
    return <div className='text-12px text-t-tertiary'>{t('conversation.toolSurface.emptyGroup')}</div>;
  }
  return (
    <div className='flex flex-wrap gap-6px' data-testid={testId}>
      {entries.map((entry) => (
        <Tag key={entry.canonical || entry.name} size='small' title={entry.canonical}>
          <span data-testid='tool-surface-entry'>{entry.name}</span>
          {entry.deferred ? (
            <span className='ml-4px text-t-tertiary'>· {t('conversation.toolSurface.deferred')}</span>
          ) : null}
        </Tag>
      ))}
    </div>
  );
};

const McpServerBlock: React.FC<{ group: ToolSurfaceMcpGroup }> = ({ group }) => {
  const { t } = useTranslation();
  return (
    <div
      className='flex flex-col gap-6px py-8px border-b border-b-solid border-[var(--color-border-2)] last:border-b-0'
      data-testid='tool-surface-mcp-server'
      data-server={group.server}
    >
      <div className='flex items-center gap-6px flex-wrap'>
        <span className='text-13px font-500 text-t-primary'>{group.server}</span>
        <Tag size='small' color={TONE_COLOR[group.tone]} data-testid='tool-surface-mcp-status' title={group.status}>
          {t(`conversation.toolSurface.status.${group.tone}`)}
        </Tag>
        {group.external ? (
          <Tag size='small' color='orange' data-testid='tool-surface-mcp-external'>
            {t('conversation.toolSurface.externalTag')}
          </Tag>
        ) : null}
      </div>
      {group.tone === 'missing' || group.tone === 'failed' ? (
        group.status ? (
          <div className='text-12px text-t-tertiary break-all'>{group.status}</div>
        ) : null
      ) : null}
      {group.tools.length > 0 ? (
        <ToolNameList entries={group.tools} testId='tool-surface-mcp-tools' />
      ) : (
        <div className='text-12px text-t-tertiary'>{t('conversation.toolSurface.noServerTools')}</div>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; count: number; testId: string; children: React.ReactNode }> = ({
  title,
  count,
  testId,
  children,
}) => (
  <section className='flex flex-col gap-8px' data-testid={testId}>
    <div className='text-12px font-500 text-t-secondary'>
      {title} ({count})
    </div>
    {children}
  </section>
);

/** Drawer body; exported for tests. */
export const ToolSurfacePanel: React.FC<{ state: ConversationToolSurfaceState }> = ({ state }) => {
  const { t } = useTranslation();
  const groups = useMemo(() => (state.status === 'reported' ? groupToolSurface(state.surface) : null), [state]);

  if (state.status !== 'reported' || !groups) {
    return (
      <div data-testid='tool-surface-not-reported'>
        <Empty description={t('conversation.toolSurface.notReported')} />
        <div className='text-12px text-t-tertiary text-center'>{t('conversation.toolSurface.notReportedHint')}</div>
      </div>
    );
  }

  const { surface } = state;
  const mcpToolCount = groups.mcp.reduce((sum, group) => sum + group.tools.length, 0);
  // Launch-config surfaces (generic ACP, Antigravity) carry no tool list: an
  // empty list there means "not reported", never "no tools".
  const discoveryUnavailable = surface.mcp_discovery === 'unavailable';
  return (
    <div className='flex flex-col gap-16px' data-testid='tool-surface-panel'>
      {groups.externalServers.length > 0 ? (
        <Alert
          type='warning'
          data-testid='tool-surface-external-hint'
          content={t('conversation.toolSurface.externalHint', { servers: groups.externalServers.join(', ') })}
        />
      ) : null}
      {discoveryUnavailable ? (
        <Alert
          type='info'
          data-testid='tool-surface-discovery-unavailable'
          content={t('conversation.toolSurface.discoveryUnavailable')}
        />
      ) : null}
      <div className='flex items-center gap-6px flex-wrap text-12px text-t-secondary'>
        {discoveryUnavailable ? null : <span>{t('conversation.toolSurface.total', { count: groups.total })}</span>}
        <Tag
          size='small'
          color={surface.mcp_isolation === 'strict' ? 'green' : 'orange'}
          data-testid='tool-surface-isolation'
        >
          {t(`conversation.toolSurface.isolation.${surface.mcp_isolation === 'strict' ? 'strict' : 'ambient'}`)}
        </Tag>
      </div>
      {surface.tool_search_inert ? (
        <div className='text-12px text-t-tertiary' data-testid='tool-surface-toolsearch-inert'>
          {t('conversation.toolSurface.toolSearchInert')}
        </div>
      ) : null}
      <Section
        title={t('conversation.toolSurface.groupBuiltin')}
        count={groups.builtin.length}
        testId='tool-surface-group-builtin'
      >
        <ToolNameList entries={groups.builtin} testId='tool-surface-builtin-tools' />
      </Section>
      <Section title={t('conversation.toolSurface.groupMcp')} count={mcpToolCount} testId='tool-surface-group-mcp'>
        {groups.mcp.length === 0 ? (
          <div className='text-12px text-t-tertiary'>{t('conversation.toolSurface.emptyGroup')}</div>
        ) : (
          <div className='flex flex-col'>
            {groups.mcp.map((group) => (
              <McpServerBlock key={group.server} group={group} />
            ))}
          </div>
        )}
      </Section>
      <Section
        title={t('conversation.toolSurface.groupSkill')}
        count={groups.skill.length}
        testId='tool-surface-group-skill'
      >
        <ToolNameList entries={groups.skill} testId='tool-surface-skill-tools' />
      </Section>
    </div>
  );
};

type ConversationToolsButtonProps = {
  conversationId: string;
};

/**
 * Header entry for the session tool drawer. Hidden when the capability
 * endpoint is unavailable; a Core that answers without `tool_surface` shows
 * the "not reported" state instead of guessed data.
 */
const ConversationToolsButton: React.FC<ConversationToolsButtonProps> = ({ conversationId }) => {
  const { t } = useTranslation();
  const state = useConversationToolSurface(conversationId);
  const [visible, setVisible] = useState(false);

  if (state.status === 'unavailable' || state.status === 'loading') return null;

  const external = state.status === 'reported' ? (state.surface.external_mcp_servers?.length ?? 0) > 0 : false;
  return (
    <>
      <Tooltip content={t('conversation.toolSurface.tooltip')}>
        <Button
          size='mini'
          type='text'
          data-testid='conversation-tools-button'
          data-external={external ? 'true' : undefined}
          aria-label={t('conversation.toolSurface.tooltip')}
          icon={
            <Toolkit
              theme='outline'
              size='14'
              fill={external ? 'rgb(var(--warning-6))' : iconColors.primary}
              strokeWidth={3}
              strokeLinejoin='miter'
              strokeLinecap='square'
            />
          }
          onClick={() => setVisible(true)}
        />
      </Tooltip>
      <Drawer
        width={380}
        title={t('conversation.toolSurface.title')}
        visible={visible}
        footer={null}
        unmountOnExit
        onCancel={() => setVisible(false)}
      >
        <ToolSurfacePanel state={state} />
      </Drawer>
    </>
  );
};

export default ConversationToolsButton;
