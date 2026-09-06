/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Select, Tag, Typography } from '@arco-design/web-react';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AgentWorkflowNodeDefinition,
  AgentWorkflowNodeKind,
  AgentWorkflowOutputFormat,
} from '@/common/types/agent/agentCenterTypes';
import {
  insertWorkflowNode,
  moveWorkflowNode,
  removeWorkflowNode,
  updateWorkflowNode,
} from '@/common/types/agent/agentWorkflow';

const { Text } = Typography;

type AgentWorkflowDefinitionFieldsProps = {
  inputPlaceholder: string;
  onInputPlaceholderChange: (value: string) => void;
  outputFormat: AgentWorkflowOutputFormat;
  onOutputFormatChange: (value: AgentWorkflowOutputFormat) => void;
  nodes: AgentWorkflowNodeDefinition[];
  onNodesChange: (nodes: AgentWorkflowNodeDefinition[]) => void;
  toolOptions: Array<{ id: string; name: string }>;
};

type ConfigurableNodeKind = Exclude<AgentWorkflowNodeKind, 'start' | 'agent' | 'output'>;

const AgentWorkflowDefinitionFields: React.FC<AgentWorkflowDefinitionFieldsProps> = ({
  inputPlaceholder,
  onInputPlaceholderChange,
  outputFormat,
  onOutputFormatChange,
  nodes,
  onNodesChange,
  toolOptions,
}) => {
  const { t } = useTranslation();
  const nodeSequence = useRef(0);

  const addNode = (kind: ConfigurableNodeKind) => {
    nodeSequence.current += 1;
    onNodesChange(insertWorkflowNode(nodes, kind, `${kind}-${Date.now()}-${nodeSequence.current}`));
  };

  const updateConfig = (node: AgentWorkflowNodeDefinition, key: string, value: string) => {
    onNodesChange(updateWorkflowNode(nodes, node.id, { config: { ...node.config, [key]: value } }));
  };

  return (
    <div className='flex flex-col gap-16px'>
      <Text type='secondary'>{t('agent.agentCenter.workflow.description')}</Text>
      <div className='rounded-8px border border-[var(--color-border-2)] p-12px'>
        <Text bold className='text-12px block mb-8px'>
          {t('agent.agentCenter.workflow.executionPath')}
        </Text>
        <div className='flex items-center gap-8px flex-wrap'>
          {nodes.map((node, index) => (
            <React.Fragment key={node.id}>
              {index > 0 ? <Text type='secondary'>→</Text> : null}
              <Tag color={node.kind === 'agent' ? 'purple' : node.kind === 'output' ? 'green' : 'arcoblue'}>
                {t(`agent.agentCenter.workflow.nodes.${node.kind}`)}
              </Tag>
            </React.Fragment>
          ))}
        </div>
        <Text type='secondary' className='text-12px block mt-8px'>
          {t('agent.agentCenter.workflow.futureHint')}
        </Text>
      </div>
      <div className='flex flex-col gap-8px'>
        <div>
          <Text bold>{t('agent.agentCenter.workflow.nodeEditor.title')}</Text>
          <Text type='secondary' className='block text-12px'>
            {t('agent.agentCenter.workflow.nodeEditor.description')}
          </Text>
        </div>
        <div className='flex gap-8px flex-wrap'>
          {(['tool', 'approval', 'condition'] as const).map((kind) => (
            <Button key={kind} size='small' disabled={nodes.length >= 20} onClick={() => addNode(kind)}>
              {t('agent.agentCenter.workflow.nodeEditor.addNode', {
                type: t(`agent.agentCenter.workflow.nodes.${kind}`),
              })}
            </Button>
          ))}
        </div>
        {nodes.map((node, index) => {
          if (node.kind === 'start' || node.kind === 'agent' || node.kind === 'output') return null;
          return (
            <div
              key={node.id}
              className='rounded-8px border border-[var(--color-border-2)] p-12px flex flex-col gap-8px'
            >
              <div className='flex items-center justify-between gap-8px'>
                <Text bold>{t(`agent.agentCenter.workflow.nodes.${node.kind}`)}</Text>
                <div className='flex gap-4px'>
                  <Button
                    size='mini'
                    disabled={index <= 2}
                    onClick={() => onNodesChange(moveWorkflowNode(nodes, node.id, -1))}
                  >
                    {t('agent.agentCenter.workflow.nodeEditor.moveUp')}
                  </Button>
                  <Button
                    size='mini'
                    disabled={index >= nodes.length - 2}
                    onClick={() => onNodesChange(moveWorkflowNode(nodes, node.id, 1))}
                  >
                    {t('agent.agentCenter.workflow.nodeEditor.moveDown')}
                  </Button>
                  <Button size='mini' status='danger' onClick={() => onNodesChange(removeWorkflowNode(nodes, node.id))}>
                    {t('common.remove')}
                  </Button>
                </div>
              </div>
              {node.kind === 'tool' ? (
                <Select
                  value={node.config?.tool_id || undefined}
                  placeholder={t('agent.agentCenter.workflow.nodeEditor.toolPlaceholder')}
                  onChange={(value) => updateConfig(node, 'tool_id', value as string)}
                >
                  {toolOptions.map((tool) => (
                    <Select.Option key={tool.id} value={tool.id}>
                      {tool.name}
                    </Select.Option>
                  ))}
                </Select>
              ) : null}
              {node.kind === 'approval' ? (
                <Input.TextArea
                  value={node.config?.message ?? ''}
                  placeholder={t('agent.agentCenter.workflow.nodeEditor.approvalPlaceholder')}
                  onChange={(value) => updateConfig(node, 'message', value)}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                />
              ) : null}
              {node.kind === 'condition' ? (
                <Input
                  value={node.config?.expression ?? ''}
                  placeholder={t('agent.agentCenter.workflow.nodeEditor.conditionPlaceholder')}
                  onChange={(value) => updateConfig(node, 'expression', value)}
                />
              ) : null}
            </div>
          );
        })}
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
