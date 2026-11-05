/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { conversation, sessionImport, type IImportedSessionSummary } from '@/common/adapter/ipcBridge';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Alert, Button, Message, Space, Table, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';

const { Text, Title } = Typography;

/**
 * E11: list Claude Code / Codex local sessions and import as WorkMate transcript.
 * Read-only against source files; no AGPL.
 */
const SessionImportSection: React.FC = () => {
  const isDesktop = isElectronDesktop();
  const [rows, setRows] = useState<IImportedSessionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isDesktop) return;
    setLoading(true);
    try {
      const next = await sessionImport.list.invoke();
      setRows(next);
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!isDesktop) {
    return (
      <div className='py-12px' data-testid='session-import-section'>
        <Title heading={6}>Import Claude / Codex sessions</Title>
        <Text type='secondary'>Local session import is desktop-only.</Text>
      </div>
    );
  }

  const onImport = async (row: IImportedSessionSummary) => {
    setBusy(true);
    try {
      const preview = await sessionImport.preview.invoke({ source: row.source, path: row.path });
      if (preview.itemCount === 0) {
        Message.warning('No model-visible turns found in that session file');
        return;
      }
      // Prefer recorded cwd; fall back to a stable placeholder so create succeeds.
      // User can re-bind workspace later in the conversation panel.
      const workspace = preview.meta.cwd?.trim() || row.cwd?.trim() || '(imported-session)';
      const created = await conversation.create.invoke({
        type: 'aionrs',
        name: `[Imported] ${row.sessionId.slice(0, 8)}`,
        extra: {
          workspace,
          custom_workspace: true,
        },
      });

      const bound = await sessionImport.bind.invoke({
        conversation_id: created.id,
        source: row.source,
        path: row.path,
      });

      await conversation.update.invoke({
        id: created.id,
        merge_extra: true,
        updates: {
          name: bound.title,
          name_source: 'user',
          extra: {
            workspace,
            imported_session: bound.meta,
          },
        } as never,
      });

      Message.success(`Imported ${bound.itemCount} turns → ${bound.title}`);
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='py-12px border-t border-[var(--color-border-2)]' data-testid='session-import-section'>
      <Title heading={6}>Import Claude / Codex sessions</Title>
      <Text type='secondary' className='block mb-8px'>
        Read-only scan of ~/.claude/projects and ~/.codex/sessions. Converts to a WorkMate transcript; source files are
        never modified.
      </Text>
      <Alert
        type='info'
        content='Imported conversations hydrate from a local transcript copy when the Host journal is empty.'
        className='mb-12px'
      />
      <Space className='mb-8px'>
        <Button size='small' loading={loading} onClick={() => void refresh()}>
          Refresh
        </Button>
      </Space>
      <Table
        data-testid='session-import-table'
        rowKey={(r) => `${r.source}:${r.path}`}
        loading={loading}
        pagination={{ pageSize: 8 }}
        size='small'
        data={rows}
        columns={[
          {
            title: 'Source',
            dataIndex: 'source',
            width: 110,
            render: (v: string) => (v === 'claude-code' ? 'Claude Code' : 'Codex'),
          },
          { title: 'Label', dataIndex: 'label', ellipsis: true },
          {
            title: 'Size',
            dataIndex: 'sizeBytes',
            width: 90,
            render: (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`,
          },
          {
            title: '',
            width: 100,
            render: (_: unknown, row: IImportedSessionSummary) => (
              <Button size='mini' type='primary' loading={busy} onClick={() => void onImport(row)}>
                Import
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
};

export default SessionImportSection;
