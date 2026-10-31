/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Input,
  Message,
  Select,
  Spin,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { IAuditChainVerification, IAuditEvent } from '@/common/types/governance';
import { formatDateTime } from '@/renderer/services/i18n/format';
import { downloadTextContent } from '@/renderer/utils/file/download';
import {
  AUDIT_ACTION_FAMILIES,
  AUDIT_ACTOR_KINDS,
  auditActorLabel,
  auditCsvFileName,
  auditTargetLabel,
  buildAuditExportQuery,
  buildAuditQuery,
  formatAuditDiff,
  getGovernanceErrorMessage,
  type AuditFilterState,
} from './governanceModel';

type AuditPanelProps = {
  /** Owner / admin see every user's events; a member only their own. */
  canViewAll: boolean;
  now?: () => number;
};

const ALL = '__all__';

/** Audit ledger: filter, page, inspect, verify the hash chain and export CSV. */
const AuditPanel: React.FC<AuditPanelProps> = ({ canViewAll, now }) => {
  const { t, i18n } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const [filter, setFilter] = useState<AuditFilterState>({});
  const [actorDraft, setActorDraft] = useState('');
  const [events, setEvents] = useState<IAuditEvent[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [verification, setVerification] = useState<IAuditChainVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async (current: AuditFilterState, before: number | null) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const page = await ipcBridge.audit.events.invoke(buildAuditQuery(current, before));
      if (id !== requestId.current) return;
      const items = page?.items ?? [];
      setEvents((prev) => (before === null ? items : [...(prev ?? []), ...items]));
      setNextBefore(page?.next_before_seq ?? null);
      setLoadError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setLoadError(getGovernanceErrorMessage(err, tRef.current, 'audit'));
      setEvents((prev) => prev ?? []);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter, null);
  }, [filter, load]);

  const verify = async () => {
    setVerifying(true);
    try {
      setVerification(await ipcBridge.audit.verify.invoke());
    } catch (err) {
      Message.error(getGovernanceErrorMessage(err, t, 'verify'));
    } finally {
      setVerifying(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const csv = await ipcBridge.audit.exportCsv.invoke(buildAuditExportQuery(filter));
      downloadTextContent(csv ?? '', auditCsvFileName((now ?? Date.now)()), 'text/csv;charset=utf-8');
      Message.success(t('settings.governance.audit.exported'));
    } catch (err) {
      Message.error(getGovernanceErrorMessage(err, t, 'export'));
    } finally {
      setExporting(false);
    }
  };

  const familyOptions = [
    { value: ALL, label: t('settings.governance.audit.allActions') },
    ...AUDIT_ACTION_FAMILIES.map((family) => ({
      value: `${family}.`,
      label: t(`settings.governance.audit.family.${family}`),
    })),
  ];
  const actorOptions = [
    { value: ALL, label: t('settings.governance.audit.allActors') },
    ...AUDIT_ACTOR_KINDS.map((kind) => ({ value: kind, label: t(`settings.governance.audit.actorKind.${kind}`) })),
  ];

  return (
    <div className='flex flex-col gap-12px' data-testid='governance-audit'>
      <Typography.Text type='secondary' className='text-12px' data-testid='audit-scope'>
        {canViewAll ? t('settings.governance.audit.scopeAll') : t('settings.governance.audit.scopeOwn')}
      </Typography.Text>
      <div className='flex flex-wrap items-center gap-8px'>
        <DatePicker.RangePicker
          className='w-300px'
          showTime
          data-testid='audit-range'
          onChange={(_text: string[], dates?: Array<{ valueOf: () => number }>) => {
            setFilter((prev) => ({
              ...prev,
              from: dates?.[0] ? dates[0].valueOf() : undefined,
              to: dates?.[1] ? dates[1].valueOf() : undefined,
            }));
          }}
        />
        <Select
          className='w-180px'
          data-testid='audit-family'
          value={filter.actionPrefix ?? ALL}
          options={familyOptions}
          onChange={(value: string) =>
            setFilter((prev) => ({ ...prev, actionPrefix: value === ALL ? undefined : value }))
          }
        />
        <Select
          className='w-140px'
          data-testid='audit-actor-kind'
          value={filter.actorKind ?? ALL}
          options={actorOptions}
          onChange={(value: string) => setFilter((prev) => ({ ...prev, actorKind: value === ALL ? undefined : value }))}
        />
        <Input.Search
          className='w-200px'
          data-testid='audit-actor'
          allowClear
          value={actorDraft}
          placeholder={t('settings.governance.audit.actorPlaceholder')}
          onChange={setActorDraft}
          onSearch={(value: string) => setFilter((prev) => ({ ...prev, actor: value.trim() || undefined }))}
          onClear={() => setFilter((prev) => ({ ...prev, actor: undefined }))}
        />
        <div className='flex-1' />
        <Button data-testid='audit-verify' loading={verifying} onClick={() => void verify()}>
          {t('settings.governance.audit.verify')}
        </Button>
        <Button data-testid='audit-export' loading={exporting} onClick={() => void exportCsv()}>
          {t('settings.governance.audit.export')}
        </Button>
      </div>
      {verification ? (
        <Alert
          data-testid='audit-chain-status'
          data-ok={verification.ok ? 'true' : 'false'}
          type={verification.ok ? 'success' : 'error'}
          content={
            verification.ok
              ? t('settings.governance.audit.chainOk', { count: verification.checked })
              : t('settings.governance.audit.chainBroken', {
                  seq: verification.first_broken_seq ?? '-',
                  count: verification.checked,
                })
          }
        />
      ) : null}
      {loadError ? <Alert type='error' data-testid='audit-load-error' content={loadError} /> : null}
      {events === null ? (
        <Spin className='self-center' />
      ) : events.length === 0 ? (
        <Empty description={t('settings.governance.audit.empty')} />
      ) : (
        <div className='flex flex-col gap-6px' data-testid='audit-list'>
          {events.map((event) => {
            const open = expanded === event.id;
            const target = auditTargetLabel(event);
            return (
              <div
                key={event.id}
                data-testid='audit-row'
                data-action={event.action}
                className='rd-10px border border-solid border-[var(--color-border-2)] px-12px py-8px flex flex-col gap-4px cursor-pointer'
                onClick={() => setExpanded(open ? null : event.id)}
              >
                <div className='flex flex-wrap items-center gap-6px'>
                  <span className='text-12px text-t-secondary'>{formatDateTime(event.ts, i18n.language)}</span>
                  <Tag size='small' color='arcoblue'>
                    {event.action}
                  </Tag>
                  <Tag size='small'>{auditActorLabel(event)}</Tag>
                  <Tag size='small' color='gray'>
                    {event.via}
                  </Tag>
                  {event.approval_id ? (
                    <Tag size='small' color='green' data-testid='audit-approval'>
                      {t('settings.governance.audit.approved', { approver: event.approver_id ?? '-' })}
                    </Tag>
                  ) : null}
                  {target ? <span className='text-12px text-t-secondary truncate'>{target}</span> : null}
                </div>
                <span className='text-13px text-t-primary break-all'>{event.summary}</span>
                {open ? (
                  <div
                    className='flex flex-col gap-4px text-12px text-t-secondary'
                    data-testid='audit-detail'
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>
                      #{event.seq} · {event.id}
                      {event.user_id ? ` · ${t('settings.governance.audit.user', { user: event.user_id })}` : ''}
                    </span>
                    <span className='break-all'>
                      {t('settings.governance.audit.hash')}: {event.hash}
                    </span>
                    {event.diff !== undefined && event.diff !== null ? (
                      <pre className='m-0 p-8px rd-8px bg-fill-2 overflow-auto max-h-240px whitespace-pre-wrap break-all'>
                        {formatAuditDiff(event.diff)}
                      </pre>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {nextBefore !== null ? (
            <Button
              className='self-center'
              data-testid='audit-more'
              loading={loading}
              onClick={() => void load(filter, nextBefore)}
            >
              {t('settings.governance.audit.loadMore')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default AuditPanel;
