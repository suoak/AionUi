/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { Button, Tooltip } from '@arco-design/web-react';
import { Timeline } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import TrajectoryDrawer from './TrajectoryDrawer';
import { useConversationTrajectory } from './useConversationTrajectory';

type ConversationTrajectoryButtonProps = {
  conversationId: string;
};

const ConversationTrajectoryButton: React.FC<ConversationTrajectoryButtonProps> = ({ conversationId }) => {
  const { t } = useTranslation();
  const { visible, setVisible, loading, error, transcript, capabilities, savingPolicy, savePolicy, reload } =
    useConversationTrajectory(conversationId);

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
          onClick={() => setVisible(true)}
        />
      </Tooltip>
      <TrajectoryDrawer
        visible={visible}
        loading={loading}
        error={error}
        savingPolicy={savingPolicy}
        transcript={transcript}
        capabilities={capabilities}
        onClose={() => setVisible(false)}
        onRetry={() => {
          void reload();
        }}
        onApprovalChange={(approval) => {
          void savePolicy({ approval });
        }}
        onKeepNChange={(keepN) => {
          void savePolicy({ compaction_keep_n: keepN });
        }}
      />
    </>
  );
};

export default ConversationTrajectoryButton;
