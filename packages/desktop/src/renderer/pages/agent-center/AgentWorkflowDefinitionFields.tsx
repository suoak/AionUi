/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Input, Select, Tag, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentWorkflowOutputFormat } from '@/common/types/agent/agentCenterTypes';

const { Text } = Typography;

type AgentWorkflowDefinitionFieldsProps = {
  inputPlaceholder: string;
  onInputPlaceholderChange: (value: string) => void;
  outputFormat: AgentWorkflowOutputFormat;
  onOutputFormatChange: (value: AgentWorkflowOutputFormat) => void;
};

const AgentWorkflowDefinitionFields: React.FC<AgentWorkflowDefinitionFieldsProps> = ({
  inputPlaceholder,
  onInputPlaceholderChange,
  outputFormat,
  onOutputFormatChange,
}) => {
  const { t } = useTranslation();

  return (
    <div className='flex flex-col gap-16px'>
      <Text type='secondary'>{t('agent.agentCenter.workflow.description')}</Text>
      <div className='rounded-8px border border-[var(--color-border-2)] p-12px'>
        <Text bold className='text-12px block mb-8px'>
          {t('agent.agentCenter.workflow.executionPath')}
        </Text>
        <div className='flex items-center gap-8px flex-wrap'>
          <Tag color='arcoblue'>{t('agent.agentCenter.workflow.nodes.start')}</Tag>
          <Text type='secondary'>→</Text>
          <Tag color='purple'>{t('agent.agentCenter.workflow.nodes.agent')}</Tag>
          <Text type='secondary'>→</Text>
          <Tag color='green'>{t('agent.agentCenter.workflow.nodes.output')}</Tag>
        </div>
        <Text type='secondary' className='text-12px block mt-8px'>
          {t('agent.agentCenter.workflow.futureHint')}
        </Text>
      </div>
      <label>
        <Text>{t('agent.agentCenter.workflow.inputLabel')}</Text>
        <Input.TextArea
          value={inputPlaceholder}
          onChange={onInputPlaceholderChange}
          placeholder={t('agent.agentCenter.workflow.inputPlaceholder')}
          autoSize={{ minRows: 2, maxRows: 4 }}
        />
      </label>
      <label>
        <Text>{t('agent.agentCenter.workflow.outputLabel')}</Text>
        <Select value={outputFormat} onChange={(value) => onOutputFormatChange(value as AgentWorkflowOutputFormat)}>
          <Select.Option value='markdown'>{t('agent.agentCenter.workflow.outputFormats.markdown')}</Select.Option>
          <Select.Option value='plain_text'>{t('agent.agentCenter.workflow.outputFormats.plainText')}</Select.Option>
          <Select.Option value='json'>{t('agent.agentCenter.workflow.outputFormats.json')}</Select.Option>
        </Select>
      </label>
    </div>
  );
};

export default AgentWorkflowDefinitionFields;
