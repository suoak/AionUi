/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JournalApprovalPolicy, JournalTranscript } from '@/common/types/journalTranscript';
import { Alert, Button, Drawer, Empty, Spin, Tag, Timeline } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import TrajectoryPolicyControls from './TrajectoryPolicyControls';
import {
  compactionLockI18nKey,
  compactionLockKey,
  isHostOnlyItem,
  isTranscriptReconstructible,
  trajectoryItemPreview,
  trajectoryKindI18nKey,
} from './trajectoryModel';

type TrajectoryDrawerProps = {
  visible: boolean;
  loading: boolean;
  error: boolean;
  savingPolicy: boolean;
  transcript: JournalTranscript | null;
  onClose: () => void;
  onRetry: () => void;
  onApprovalChange: (approval: JournalApprovalPolicy) => void;
  onKeepNChange: (keepN: number) => void;
};

const TrajectoryDrawer: React.FC<TrajectoryDrawerProps> = ({
  visible,
  loading,
  error,
  savingPolicy,
  transcript,
  onClose,
  onRetry,
  onApprovalChange,
  onKeepNChange,
}) => {
  const { t } = useTranslation();
  const items = transcript?.items ?? [];
  const lockKey = compactionLockKey(transcript?.compaction_lock ?? 'none');

  return (
    <Drawer
      width={420}
      title={t('conversation.trajectory.title')}
      visible={visible}
      onCancel={onClose}
      footer={null}
      unmountOnExit
      className='conversation-trajectory-drawer'
    >
      <div data-testid='conversation-trajectory-drawer' className='flex flex-col gap-16px min-h-0'>
        {transcript && !error && (
          <div className='flex flex-col gap-8px text-12px text-t-secondary'>
            <div className='flex flex-wrap items-center gap-8px'>
              <span>{t('conversation.trajectory.itemCount', { count: items.length })}</span>
              <span>{t('conversation.trajectory.surfaceTokens', { count: transcript.tokens.surface_tokens })}</span>
            </div>
            <div className='flex flex-wrap items-center gap-8px'>
              <Tag size='small' color={lockKey === 'open' ? 'orangered' : lockKey === 'closed' ? 'arcoblue' : 'gray'}>
                {t(compactionLockI18nKey(lockKey))}
              </Tag>
              <Tag size='small' color={transcript.tool_pairing_balanced ? 'green' : 'orangered'}>
                {t(
                  transcript.tool_pairing_balanced
                    ? 'conversation.trajectory.pairingBalanced'
                    : 'conversation.trajectory.pairingOpen'
                )}
              </Tag>
            </div>
            {!isTranscriptReconstructible(transcript) && (
              <div data-testid='conversation-trajectory-not-reconstructible'>
                <Alert type='warning' content={t('conversation.trajectory.notReconstructible')} />
              </div>
            )}
            <TrajectoryPolicyControls
              transcript={transcript}
              saving={savingPolicy}
              onApprovalChange={onApprovalChange}
              onKeepNChange={onKeepNChange}
            />
          </div>
        )}

        {loading ? (
          <div className='flex justify-center py-48px'>
            <Spin />
          </div>
        ) : error ? (
          <div className='flex flex-col items-center gap-12px py-32px'>
            <span className='text-13px text-t-secondary'>{t('conversation.trajectory.loadFailed')}</span>
            <Button size='small' type='secondary' onClick={onRetry}>
              {t('common.retry')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <Empty description={t('conversation.trajectory.empty')} />
        ) : (
          <Timeline>
            {items.map((item) => {
              const preview = trajectoryItemPreview(item);
              return (
                <Timeline.Item key={`${item.sequence}:${item.event_id}`} label={`#${item.sequence}`}>
                  <div data-testid='conversation-trajectory-item' className='flex flex-col gap-6px min-w-0'>
                    <div className='flex flex-wrap items-center gap-6px'>
                      <span className='text-13px font-500 text-t-primary'>
                        {t(trajectoryKindI18nKey(item.transcript_kind))}
                      </span>
                      <Tag size='small' color={isHostOnlyItem(item) ? 'gray' : 'arcoblue'}>
                        {t(
                          isHostOnlyItem(item)
                            ? 'conversation.trajectory.hostOnly'
                            : 'conversation.trajectory.modelVisible'
                        )}
                      </Tag>
                      {item.compacted && (
                        <Tag size='small' color='orange'>
                          {t('conversation.trajectory.compacted')}
                        </Tag>
                      )}
                    </div>
                    {preview ? <p className='m-0 text-12px text-t-secondary break-words'>{preview}</p> : null}
                  </div>
                </Timeline.Item>
              );
            })}
          </Timeline>
        )}
      </div>
    </Drawer>
  );
};

export default TrajectoryDrawer;
