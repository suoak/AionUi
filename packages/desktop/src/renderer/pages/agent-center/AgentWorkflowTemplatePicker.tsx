/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Tag, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  AGENT_WORKFLOW_TEMPLATE_CATEGORIES,
  buildAgentWorkflowTemplates,
  type AgentWorkflowTemplate,
} from '@/common/types/agent/agentWorkflowTemplates';

const { Text } = Typography;

type AgentWorkflowTemplatePickerProps = {
  onSelect: (template: AgentWorkflowTemplate) => void;
};

const AgentWorkflowTemplatePicker: React.FC<AgentWorkflowTemplatePickerProps> = ({ onSelect }) => {
  const { t } = useTranslation();
  const templates = buildAgentWorkflowTemplates(t);

  return (
    <div className='flex flex-col gap-8px' data-testid='agent-template-picker'>
      <div>
        <Text bold>{t('agent.agentCenter.templates.title')}</Text>
        <Text type='secondary' className='block text-12px'>
          {t('agent.agentCenter.templates.description')}
        </Text>
      </div>
      {AGENT_WORKFLOW_TEMPLATE_CATEGORIES.map((category) => {
        const items = templates.filter((template) => template.category === category);
        if (items.length === 0) return null;
        return (
          <div key={category} className='flex flex-col gap-6px' data-testid={`agent-template-group-${category}`}>
            <Text type='secondary' className='text-12px'>
              {t(`agent.agentCenter.templates.categories.${category}`)}
            </Text>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-8px'>
              {items.map((template) => (
                <Button
                  key={template.id}
                  long
                  className='!h-auto !min-h-64px !p-10px !whitespace-normal !text-left'
                  onClick={() => onSelect(template)}
                  data-testid={`agent-template-${template.id}`}
                >
                  <span className='block min-w-0'>
                    <span className='flex items-center gap-6px font-medium text-t-primary'>
                      <span className='min-w-0'>{template.name}</span>
                      {template.deliverable ? (
                        <Tag size='small' color='arcoblue' className='shrink-0'>
                          .{template.deliverable}
                        </Tag>
                      ) : null}
                    </span>
                    <span className='block text-12px text-t-tertiary mt-2px'>{template.description}</span>
                  </span>
                </Button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AgentWorkflowTemplatePicker;
