import { ipcBridge } from '@/common';
import type { TaskEvidence, TaskReview, TaskRun, TaskTraceEvent } from '@/common/types/agent/taskSession';
import {
  Alert,
  Button,
  Descriptions,
  Empty,
  List,
  Message,
  Modal,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
} from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

type Props = { visible: boolean; taskId: string; conversationId: string; onCancel: () => void };

const value = (input: unknown) => (input === undefined || input === null || input === '' ? '—' : String(input));
const formatTime = (timestamp?: number) => (timestamp ? new Date(timestamp).toLocaleString() : '—');
const payloadValue = (event: TaskTraceEvent, key: string) => value(event.payload[key]);

const TaskReviewPanel: React.FC<Props> = ({ visible, taskId, conversationId, onCancel }) => {
  const { t } = useTranslation();
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [diffs, setDiffs] = useState<Record<string, string>>({});
  const [loadingDiff, setLoadingDiff] = useState<string>();
  const { data: runs, error: runsError } = useSWR(visible ? ['taskReviewRuns', taskId] : null, () =>
    ipcBridge.taskSession.run.list.invoke({ id: taskId })
  );
  const runId = selectedRunId ?? runs?.[0]?.id;
  const { data: review, error: reviewError } = useSWR(visible && runId ? ['taskReview', taskId, runId] : null, () =>
    ipcBridge.taskSession.run.review.invoke({ id: taskId, run_id: runId! })
  );
  const changes = useMemo(() => review?.evidence.filter((item) => item.kind === 'file') ?? [], [review]);
  const tools = useMemo(() => review?.trace.filter((item) => item.event_type.startsWith('tool.')) ?? [], [review]);
  const policy = useMemo(
    () => review?.trace.filter((item) => item.event_type === 'tool.allowed' || item.event_type === 'tool.denied') ?? [],
    [review]
  );

  const loadDiff = async (fileEvidence: TaskEvidence) => {
    const diff = review?.evidence.find(
      (item) => item.kind === 'diff' && item.trace_event_id === fileEvidence.trace_event_id
    );
    if (!diff?.reference || loadingDiff) return;
    setLoadingDiff(diff.reference);
    try {
      const retained = await ipcBridge.conversation.getRetainedOutput.invoke({
        conversation_id: conversationId,
        reference: diff.reference,
      });
      setDiffs((current) => ({ ...current, [fileEvidence.id]: retained.content }));
    } catch (error) {
      console.error('[TaskReview] Failed to load diff:', error);
      Message.error(t('conversation.taskSession.review.loadFailed'));
    } finally {
      setLoadingDiff(undefined);
    }
  };

  const renderOverview = (data: TaskReview) => {
    const duration = data.run.finished_at ? Math.max(0, data.run.finished_at - data.run.started_at) : undefined;
    const binding = data.task.runtime_binding;
    return (
      <Descriptions
        column={2}
        border
        size='small'
        data={[
          { label: t('common.status'), value: <Tag>{data.run.status}</Tag> },
          { label: t('conversation.taskSession.review.mode'), value: value(data.run.mode ?? data.task.mode) },
          { label: t('conversation.taskSession.review.agent'), value: value(data.run.agent_id) },
          { label: t('conversation.taskSession.review.runtime'), value: value(data.run.agent_runtime) },
          {
            label: t('conversation.taskSession.review.runtimeSession'),
            value: binding ? (
              <Typography.Text code copyable>
                {binding.runtime_session_id}
              </Typography.Text>
            ) : (
              value(undefined)
            ),
          },
          {
            label: t('conversation.taskSession.review.runtimeState'),
            value: binding ? <Tag>{binding.state}</Tag> : value(undefined),
          },
          {
            label: t('conversation.taskSession.review.runtimeVersion'),
            value: value(binding?.runtime_version),
          },
          { label: t('common.model'), value: value(data.run.model) },
          { label: t('conversation.taskSession.review.isolation'), value: value(data.run.planning_isolation) },
          { label: t('conversation.taskSession.review.started'), value: formatTime(data.run.started_at) },
          { label: t('conversation.taskSession.review.finished'), value: formatTime(data.run.finished_at) },
          {
            label: t('conversation.taskSession.review.duration'),
            value: duration === undefined ? '—' : `${duration} ms`,
          },
          {
            label: t('conversation.taskSession.review.artifact'),
            value: value(data.run.plan_artifact_id ?? data.run.goal_artifact_id),
          },
          {
            label: t('conversation.taskSession.review.usage'),
            value: data.run.usage ? JSON.stringify(data.run.usage) : '—',
          },
          {
            label: t('conversation.taskSession.review.result'),
            value: value(data.run.result_summary ?? data.run.error_message),
          },
        ]}
      />
    );
  };

  return (
    <Modal
      visible={visible}
      title={t('conversation.taskSession.review.title')}
      footer={null}
      unmountOnExit
      onCancel={onCancel}
      className='w-920px'
    >
      <Space direction='vertical' className='w-full'>
        {runs?.length ? (
          <Select
            value={runId}
            onChange={setSelectedRunId}
            className='w-full'
            aria-label={t('conversation.taskSession.review.run')}
          >
            {runs.map((run: TaskRun) => (
              <Select.Option
                key={run.id}
                value={run.id}
              >{`${run.run_kind} · ${run.status} · ${formatTime(run.started_at)}`}</Select.Option>
            ))}
          </Select>
        ) : null}
        {runsError || reviewError ? (
          <Alert type='error' content={t('conversation.taskSession.review.loadFailed')} />
        ) : null}
        {!runs && !runsError ? <Spin className='self-center' /> : null}
        {runs?.length === 0 ? <Empty description={t('conversation.taskSession.review.noRuns')} /> : null}
        {review ? (
          <Tabs defaultActiveTab='overview'>
            <Tabs.TabPane key='overview' title={t('conversation.taskSession.review.overview')}>
              {renderOverview(review)}
            </Tabs.TabPane>
            <Tabs.TabPane key='changes' title={t('conversation.taskSession.review.changes')}>
              {changes.length ? (
                <List
                  dataSource={changes}
                  render={(item) => (
                    <List.Item
                      key={item.id}
                      actions={[
                        <Button
                          key='diff'
                          size='mini'
                          loading={
                            loadingDiff ===
                            review.evidence.find((e) => e.kind === 'diff' && e.trace_event_id === item.trace_event_id)
                              ?.reference
                          }
                          onClick={() => void loadDiff(item)}
                        >
                          {t('conversation.taskSession.review.viewDiff')}
                        </Button>,
                      ]}
                    >
                      <Space direction='vertical'>
                        <Typography.Text>{value(item.metadata.path ?? item.reference)}</Typography.Text>
                        <Space>
                          <Tag>{value(item.metadata.change_type)}</Tag>
                          <Typography.Text type='secondary'>{`+${value(item.metadata.added_lines)} -${value(item.metadata.deleted_lines)}`}</Typography.Text>
                        </Space>
                        {diffs[item.id] ? (
                          <Typography.Paragraph code copyable>
                            {diffs[item.id]}
                          </Typography.Paragraph>
                        ) : null}
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description={t('conversation.taskSession.review.noChanges')} />
              )}
            </Tabs.TabPane>
            <Tabs.TabPane key='tools' title={t('conversation.taskSession.review.tools')}>
              <List
                dataSource={tools}
                render={(item) => (
                  <List.Item key={item.event_id}>
                    <Space>
                      <Typography.Text>{item.sequence}</Typography.Text>
                      <Tag>{item.event_type}</Tag>
                      <Typography.Text>{payloadValue(item, 'tool')}</Typography.Text>
                      <Typography.Text type='secondary'>{payloadValue(item, 'capability')}</Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Tabs.TabPane>
            <Tabs.TabPane key='policy' title={t('conversation.taskSession.review.policy')}>
              <List
                dataSource={policy}
                render={(item) => (
                  <List.Item key={item.event_id}>
                    <Space direction='vertical'>
                      <Space>
                        <Tag color={item.event_type === 'tool.denied' ? 'red' : 'green'}>
                          {payloadValue(item, 'decision').toUpperCase()}
                        </Tag>
                        <Typography.Text>{payloadValue(item, 'capability')}</Typography.Text>
                        <Typography.Text>{payloadValue(item, 'tool')}</Typography.Text>
                      </Space>
                      <Typography.Text type='secondary'>{payloadValue(item, 'reason')}</Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Tabs.TabPane>
            <Tabs.TabPane key='approvals' title={t('conversation.taskSession.review.approvals')}>
              <List
                dataSource={review.approvals}
                render={(item) => (
                  <List.Item key={item.id}>
                    <Space direction='vertical'>
                      <Space>
                        <Tag>{item.approval_type}</Tag>
                        <Tag>{item.status}</Tag>
                      </Space>
                      <Typography.Text code>{item.artifact_hash}</Typography.Text>
                      <Typography.Text type='secondary'>{`${formatTime(item.requested_at)} · ${formatTime(item.resolved_at)} · ${value(item.resolved_by)}`}</Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Tabs.TabPane>
            <Tabs.TabPane key='verification' title={t('conversation.taskSession.review.verification')}>
              <List
                dataSource={review.acceptance_criteria}
                render={(item) => (
                  <List.Item key={item.id}>
                    <Space direction='vertical'>
                      <Space>
                        <Tag>{item.status}</Tag>
                        <Typography.Text>{item.description}</Typography.Text>
                      </Space>
                      {review.evidence
                        .filter((e) => e.criterion_id === item.id)
                        .map((e) => (
                          <Typography.Text key={e.id} type='secondary'>{`${e.kind}: ${e.summary}`}</Typography.Text>
                        ))}
                    </Space>
                  </List.Item>
                )}
              />
            </Tabs.TabPane>
          </Tabs>
        ) : null}
      </Space>
    </Modal>
  );
};

export default TaskReviewPanel;
