import type { TrajectoryOverview as Overview } from '@/common/types/journalTranscript';
import { Statistic } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type Props = { overview: Overview };

const duration = (value?: number) => (value === undefined ? '—' : `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`);
const tokens = (value?: number) => (value === undefined ? '—' : value.toLocaleString());

const TrajectoryOverview: React.FC<Props> = ({ overview }) => {
  const { t } = useTranslation();
  const values = [
    [t('conversation.trajectory.overview.turns'), overview.turns],
    [t('conversation.trajectory.overview.steps'), overview.steps],
    [t('conversation.trajectory.overview.tools'), overview.tools],
    [t('conversation.trajectory.overview.errors'), overview.errors],
    [t('conversation.trajectory.overview.duration'), duration(overview.total_duration_ms)],
    [t('conversation.trajectory.overview.firstOutput'), duration(overview.first_output_ms)],
    [t('conversation.trajectory.overview.inputTokens'), tokens(overview.tokens.input)],
    [t('conversation.trajectory.overview.outputTokens'), tokens(overview.tokens.output)],
    [t('conversation.trajectory.overview.cachedTokens'), tokens(overview.tokens.cached)],
    [t('conversation.trajectory.overview.thinkingTokens'), tokens(overview.tokens.thinking)],
  ] as const;
  return (
    <div
      className='grid grid-cols-2 sm:grid-cols-5 xl:grid-cols-10 gap-8px'
      data-testid='conversation-trajectory-overview'
    >
      {values.map(([title, value]) => (
        <div key={title} className='bg-bg-2 rd-8px px-12px py-8px min-w-0'>
          <Statistic title={title} value={value} countUp={false} />
        </div>
      ))}
    </div>
  );
};

export default TrajectoryOverview;
