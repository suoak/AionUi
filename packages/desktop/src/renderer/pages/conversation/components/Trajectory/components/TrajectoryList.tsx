import type { TrajectoryRecord } from '@/common/types/journalTranscript';
import { Button, Empty, Spin, Tag } from '@arco-design/web-react';
import { Down, Right } from '@icon-park/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { buildVisibleTrajectoryRecords } from '../utils/trajectoryTree';

type Props = {
  records: TrajectoryRecord[];
  selectedId?: string;
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  onSelect: (record: TrajectoryRecord) => void;
  onLoadOlder: () => void;
  onAtBottomChange: (atBottom: boolean) => void;
  followLatestSignal: number;
};

const highlightedStatuses = new Set([
  'running',
  'waiting',
  'failed',
  'error',
  'canceled',
  'rejected',
  'recovered',
  'degraded',
]);

const TrajectoryList: React.FC<Props> = ({
  records,
  selectedId,
  loading,
  loadingOlder,
  hasMore,
  onSelect,
  onLoadOlder,
  onAtBottomChange,
  followLatestSignal,
}) => {
  const { t } = useTranslation();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [collapsedRecordIds, setCollapsedRecordIds] = useState<Set<string>>(() => new Set());
  const visibleRecords = useMemo(
    () => buildVisibleTrajectoryRecords(records, collapsedRecordIds),
    [collapsedRecordIds, records]
  );

  useEffect(() => {
    if (followLatestSignal > 0 && visibleRecords.length > 0) {
      virtuosoRef.current?.scrollToIndex({ index: visibleRecords.length - 1, align: 'end', behavior: 'smooth' });
    }
  }, [followLatestSignal, visibleRecords.length]);

  if (loading) return <Spin className='h-full flex items-center justify-center' />;
  if (records.length === 0) return <Empty description={t('conversation.trajectory.empty')} />;

  return (
    <Virtuoso
      ref={virtuosoRef}
      data={visibleRecords}
      computeItemKey={(_index, item) => item.record.record_id}
      initialTopMostItemIndex={visibleRecords.length - 1}
      followOutput='smooth'
      atBottomStateChange={onAtBottomChange}
      startReached={() => {
        if (hasMore && !loadingOlder) onLoadOlder();
      }}
      components={{
        Header: () =>
          loadingOlder ? (
            <div className='flex justify-center py-8px'>
              <Spin size={16} />
            </div>
          ) : null,
      }}
      itemContent={(index, item) => {
        const { record, depth, hasChildren } = item;
        const selected = selectedId === record.record_id;
        const previous = visibleRecords[index - 1]?.record;
        const startsTurn = Boolean(record.turn_id && record.turn_id !== previous?.turn_id);
        const startsStep = Boolean(record.step_id && record.step_id !== previous?.step_id);
        const collapsed = collapsedRecordIds.has(record.record_id);
        return (
          <div className='px-8px py-4px' style={{ paddingLeft: `${8 + Math.min(depth, 6) * 20}px` }}>
            {startsTurn && (
              <div className='px-12px pt-10px pb-4px text-12px font-600 text-t-primary truncate'>
                {t('conversation.trajectory.category.turn')} · {record.turn_id}
              </div>
            )}
            {startsStep && (
              <div className='px-12px py-3px text-11px text-t-secondary truncate'>
                {t('conversation.trajectory.inspector.step')} · {record.step_id}
              </div>
            )}
            <div className={`flex items-stretch rd-8px ${selected ? 'bg-bg-3' : 'hover:bg-bg-2'}`}>
              {hasChildren && (
                <Button
                  type='text'
                  size='mini'
                  className='!h-auto !w-28px !px-0 shrink-0'
                  icon={collapsed ? <Right /> : <Down />}
                  aria-label={t(collapsed ? 'common.expand' : 'common.collapse')}
                  aria-expanded={!collapsed}
                  data-testid='conversation-trajectory-tree-toggle'
                  onClick={() =>
                    setCollapsedRecordIds((current) => {
                      const next = new Set(current);
                      if (next.has(record.record_id)) next.delete(record.record_id);
                      else next.add(record.record_id);
                      return next;
                    })
                  }
                />
              )}
              <Button
                type='text'
                long
                className='!h-auto !justify-start !text-left !px-12px !py-10px flex-1 min-w-0'
                data-testid='conversation-trajectory-item'
                onClick={() => onSelect(record)}
              >
                <div className='w-full min-w-0 flex flex-col gap-5px'>
                  <div className='flex items-center gap-8px min-w-0'>
                    <span className='text-12px text-t-secondary shrink-0'>#{record.first_sequence}</span>
                    <span className='text-13px font-500 text-t-primary truncate'>
                      {t(`conversation.trajectory.category.${record.category}`)}
                      {record.title && record.title.toLowerCase() !== record.category ? ` · ${record.title}` : ''}
                    </span>
                    {highlightedStatuses.has(record.status) && (
                      <Tag size='small'>{t(`conversation.trajectory.status.${record.status}`)}</Tag>
                    )}
                    <span className='ml-auto text-11px text-t-secondary shrink-0'>
                      {record.duration_ms === undefined ? '' : `${record.duration_ms} ms`}
                    </span>
                  </div>
                  {record.summary && <span className='text-12px text-t-secondary truncate'>{record.summary}</span>}
                </div>
              </Button>
            </div>
          </div>
        );
      }}
    />
  );
};

export default TrajectoryList;
