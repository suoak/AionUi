/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { Button, Tooltip } from '@arco-design/web-react';
import { Timeline } from '@icon-park/react';
import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useTrajectoryHost } from '../ChatLayout';
import TrajectoryView from './components/TrajectoryView';
import { useConversationTrajectory } from './hooks/useConversationTrajectory';

type ConversationTrajectoryButtonProps = {
  conversationId: string;
};

const ConversationTrajectoryButton: React.FC<ConversationTrajectoryButtonProps> = ({ conversationId }) => {
  const { t } = useTranslation();
  const trajectory = useConversationTrajectory(conversationId);
  const trajectoryHost = useTrajectoryHost();
  const view = (
    <TrajectoryView
      conversationId={conversationId}
      visible={trajectory.visible}
      rawMode={trajectory.rawMode}
      loading={trajectory.loading}
      loadingOlder={trajectory.loadingOlder}
      error={trajectory.error}
      records={trajectory.records}
      overview={trajectory.overview}
      hasMore={trajectory.hasMore}
      selected={trajectory.selected}
      transcript={trajectory.transcript}
      savingPolicy={trajectory.savingPolicy}
      onClose={() => trajectory.setVisible(false)}
      onRawModeChange={trajectory.setRawMode}
      onRetry={() => void trajectory.reload()}
      onLoadOlder={() => void trajectory.loadOlder()}
      onSelect={(record) => void trajectory.loadDetail(record)}
      onApprovalChange={(approval) => void trajectory.savePolicy({ approval })}
      onKeepNChange={(keepN) => void trajectory.savePolicy({ compaction_keep_n: keepN })}
    />
  );

  return (
    <>
      <Tooltip content={t('conversation.trajectory.tooltip')}>
        <Button
          size='mini'
          type='text'
          data-testid='conversation-trajectory-button'
          aria-label={t('conversation.trajectory.tooltip')}
          icon={
            <Timeline
              theme='outline'
              size='14'
              fill={iconColors.primary}
              strokeWidth={3}
              strokeLinejoin='miter'
              strokeLinecap='square'
            />
          }
          onClick={() => trajectory.setVisible(true)}
        />
      </Tooltip>
      {trajectoryHost ? createPortal(view, trajectoryHost) : view}
    </>
  );
};

export default ConversationTrajectoryButton;
