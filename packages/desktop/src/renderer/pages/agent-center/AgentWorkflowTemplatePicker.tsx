/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { buildAgentWorkflowTemplates, type AgentWorkflowTemplate } from '@/common/types/agent/agentWorkflowTemplates';

const { Text } = Typography;

type AgentWorkflowTemplatePickerProps = {
  onSelect: (template: AgentWorkflowTemplate) => void;
};

const AgentWorkflowTemplatePicker: React.FC<AgentWorkflowTemplatePickerProps> = ({ onSelect }) => {
  const { t } = useTranslation();
  const templates = buildAgentWorkflowTemplates(t);

  return (
    <div className='flex flex-col gap-8px'>
      <div>
        <Text bold>{t('agent.agentCenter.templates.title')}</Text>
        <Text type='secondary' className='block text-12px'>
          {t('agent.agentCenter.templates.description')}
        </Text>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-8px'>
        {templates.map((template) => (
          <Button
            key={template.id}
            long
            className='!h-auto !min-h-64px !p-10px !whitespace-normal !text-left'
            onClick={() => onSelect(template)}
          >
            <span className='block min-w-0'>
              <span className='block font-medium text-t-primary'>{template.name}</span>
              <span className='block text-12px text-t-tertiary mt-2px'>{template.description}</span>
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
};

export default AgentWorkflowTemplatePicker;
