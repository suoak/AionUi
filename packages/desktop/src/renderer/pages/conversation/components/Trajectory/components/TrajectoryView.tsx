import type {
  JournalApprovalPolicy,
  JournalTranscript,
  TrajectoryOverview as Overview,
  TrajectoryRecord,
} from '@/common/types/journalTranscript';
import { Alert, Button, Input, Popover, Select, Spin, Switch } from '@arco-design/web-react';
import { CloseSmall, SettingOne } from '@icon-park/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TrajectoryInspector from './TrajectoryInspector';
import TrajectoryList from './TrajectoryList';
import TrajectoryOverview from './TrajectoryOverview';
import TrajectoryPolicyControls from './TrajectoryPolicyControls';

type Props = {
  conversationId: string;
  visible: boolean;
  rawMode: boolean;
  loading: boolean;
  loadingOlder: boolean;
  error: boolean;
  records: TrajectoryRecord[];
  overview: Overview;
  hasMore: boolean;
  selected: TrajectoryRecord | null;
  transcript: JournalTranscript | null;
  savingPolicy: boolean;
  onClose: () => void;
  onRawModeChange: (raw: boolean) => void;
  onRetry: () => void;
  onLoadOlder: () => void;
  onSelect: (record: TrajectoryRecord) => void;
  onApprovalChange: (approval: JournalApprovalPolicy) => void;
  onKeepNChange: (keepN: number) => void;
};

const TrajectoryView: React.FC<Props> = ({
  conversationId,
  visible,
  rawMode,
  loading,
  loadingOlder,
  error,
  records,
  overview,
  hasMore,
  selected,
  transcript,
  savingPolicy,
  onClose,
  onRawModeChange,
  onRetry,
  onLoadOlder,
  onSelect,
  onApprovalChange,
  onKeepNChange,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [followLatestSignal, setFollowLatestSignal] = useState(0);
  const previousCount = useRef(records.length);

  useEffect(() => {
    setSearch('');
    setCategory('all');
    setAtBottom(true);
    setUnseen(0);
    previousCount.current = records.length;
  }, [rawMode, visible]);

  useEffect(() => {
    const added = Math.max(0, records.length - previousCount.current);
    if (!atBottom && added > 0) setUnseen((current) => current + added);
    previousCount.current = records.length;
  }, [atBottom, records.length]);

  const categories = useMemo(() => [...new Set(records.map((record) => record.category))].toSorted(), [records]);
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return records.filter(
      (record) =>
        (category === 'all' || record.category === category) &&
        (!keyword ||
          `${record.title}\n${record.summary}\n${record.input_preview ?? ''}\n${record.output_preview ?? ''}`
            .toLowerCase()
            .includes(keyword))
    );
  }, [category, records, search]);

  if (!visible) return null;

  return (
    <div
      role='dialog'
      aria-modal='false'
      className='pointer-events-auto absolute inset-0 h-full min-h-0 flex flex-col bg-base'
      data-testid='conversation-trajectory-view'
    >
      <header className='min-h-54px px-12px md:px-16px py-8px flex flex-wrap items-center gap-8px md:gap-12px border-b border-b-base shrink-0'>
        <span className='text-16px font-600 text-t-primary'>{t('conversation.trajectory.title')}</span>
        <Input.Search
          size='small'
          allowClear
          className='w-full order-last md:order-none md:w-260px'
          placeholder={t('conversation.trajectory.searchPlaceholder')}
          value={search}
          onChange={setSearch}
        />
        <Select size='small' value={category} className='w-130px md:w-150px' onChange={setCategory}>
          <Select.Option value='all'>{t('conversation.trajectory.allCategories')}</Select.Option>
          {categories.map((item) => (
            <Select.Option key={item} value={item}>
              {t(`conversation.trajectory.category.${item}`)}
            </Select.Option>
          ))}
        </Select>
        <div className='ml-auto flex items-center gap-6px md:gap-8px'>
          <span className='text-12px text-t-secondary'>{t('conversation.trajectory.rawMode')}</span>
          <Switch size='small' checked={rawMode} onChange={onRawModeChange} />
          {transcript && (
            <Popover
              trigger='click'
              position='br'
              content={
                <TrajectoryPolicyControls
                  transcript={transcript}
                  saving={savingPolicy}
                  onApprovalChange={onApprovalChange}
                  onKeepNChange={onKeepNChange}
                />
              }
            >
              <Button
                type='text'
                size='small'
                icon={<SettingOne />}
                aria-label={t('conversation.trajectory.settings')}
              />
            </Popover>
          )}
          <Button type='text' size='small' icon={<CloseSmall />} aria-label={t('common.close')} onClick={onClose} />
        </div>
      </header>
      {!rawMode && (
        <div className='p-12px border-b border-b-base shrink-0'>
          <TrajectoryOverview overview={overview} />
        </div>
      )}
      {error ? (
        <div className='p-16px'>
          <Alert
            type='error'
            content={t('conversation.trajectory.loadFailed')}
            action={<Button onClick={onRetry}>{t('common.retry')}</Button>}
          />
        </div>
      ) : loading && records.length === 0 ? (
        <Spin className='flex-1 flex items-center justify-center' />
      ) : (
        <div className='flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(0,3fr)_minmax(220px,2fr)] md:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] md:grid-rows-1'>
          <div className='min-h-0 relative border-b border-b-base md:border-b-0 md:border-r md:border-r-base'>
            <TrajectoryList
              records={filtered}
              selectedId={selected?.record_id}
              loading={false}
              loadingOlder={loadingOlder}
              hasMore={hasMore}
              onSelect={onSelect}
              onLoadOlder={onLoadOlder}
              onAtBottomChange={(next) => {
                setAtBottom(next);
                if (next) setUnseen(0);
              }}
              followLatestSignal={followLatestSignal}
            />
            {unseen > 0 && (
              <Button
                type='primary'
                size='small'
                className='absolute bottom-16px left-1/2 -translate-x-1/2'
                onClick={() => {
                  setAtBottom(true);
                  setUnseen(0);
                  setFollowLatestSignal((current) => current + 1);
                }}
              >
                {t('conversation.trajectory.newRecords', { count: unseen })}
              </Button>
            )}
          </div>
          <TrajectoryInspector conversationId={conversationId} record={selected} />
        </div>
      )}
    </div>
  );
};

export default TrajectoryView;
