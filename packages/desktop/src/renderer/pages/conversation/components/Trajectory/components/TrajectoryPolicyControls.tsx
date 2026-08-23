import {
  COMPACTION_KEEP_N_OPTIONS,
  type JournalApprovalPolicy,
  type JournalTranscript,
} from '@/common/types/journalTranscript';
import { Radio, Select } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  transcript: JournalTranscript;
  saving: boolean;
  onApprovalChange: (approval: JournalApprovalPolicy) => void;
  onKeepNChange: (keepN: number) => void;
};

const TrajectoryPolicyControls: React.FC<Props> = ({ transcript, saving, onApprovalChange, onKeepNChange }) => {
  const { t } = useTranslation();
  return (
    <div data-testid='conversation-trajectory-policy' className='flex flex-col gap-12px w-280px'>
      <span className='text-12px text-t-secondary'>{t('conversation.trajectory.policy.approvalLabel')}</span>
      <Radio.Group
        value={transcript.approval_policy}
        disabled={saving}
        onChange={(next) => onApprovalChange(next === 'never' ? 'never' : 'ask')}
      >
        <Radio value='ask'>{t('conversation.trajectory.policy.approvalAsk')}</Radio>
        <Radio value='never'>{t('conversation.trajectory.policy.approvalNever')}</Radio>
      </Radio.Group>
      <span className='text-12px text-t-secondary'>{t('conversation.trajectory.policy.keepNLabel')}</span>
      <Select
        size='small'
        value={String(transcript.compaction_keep_n)}
        disabled={saving}
        onChange={(next) => onKeepNChange(Number(next))}
      >
        {[...new Set([...COMPACTION_KEEP_N_OPTIONS, transcript.compaction_keep_n])]
          .toSorted((left, right) => left - right)
          .map((keepN) => (
            <Select.Option key={keepN} value={String(keepN)}>
              {t('conversation.trajectory.policy.keepNOption', { count: keepN })}
            </Select.Option>
          ))}
      </Select>
    </div>
  );
};

export default TrajectoryPolicyControls;
