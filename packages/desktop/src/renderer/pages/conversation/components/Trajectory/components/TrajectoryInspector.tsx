import { ipcBridge } from '@/common';
import type { TrajectoryRecord } from '@/common/types/journalTranscript';
import { Button, Descriptions, Empty, Message, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = { conversationId: string; record: TrajectoryRecord | null };

const value = (input: unknown) => {
  if (input === undefined || input === null || input === '') return '—';
  return typeof input === 'string' ? input : JSON.stringify(input, null, 2);
};

const TrajectoryInspector: React.FC<Props> = ({ conversationId, record }) => {
  const { t } = useTranslation();
  const [retainedOutput, setRetainedOutput] = useState<string | null>(null);
  const [loadingRetainedOutput, setLoadingRetainedOutput] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    requestIdRef.current += 1;
    setRetainedOutput(null);
    setLoadingRetainedOutput(false);
  }, [conversationId, record?.record_id, record?.retained_output_reference]);

  const loadRetainedOutput = useCallback(async () => {
    const reference = record?.retained_output_reference;
    if (!reference || loadingRetainedOutput) return;
    const requestId = ++requestIdRef.current;
    setLoadingRetainedOutput(true);
    try {
      const result = await ipcBridge.conversation.getRetainedOutput.invoke({
        conversation_id: conversationId,
        reference,
      });
      if (requestId !== requestIdRef.current) return;
      setRetainedOutput(result.content);
    } catch {
      if (requestId !== requestIdRef.current) return;
      Message.error(t('conversation.retainedOutput.loadFailed'));
    } finally {
      if (requestId === requestIdRef.current) setLoadingRetainedOutput(false);
    }
  }, [conversationId, loadingRetainedOutput, record?.retained_output_reference, t]);

  if (!record) return <Empty description={t('conversation.trajectory.inspector.empty')} />;
  const timing = [record.started_at_ms, record.completed_at_ms, record.duration_ms].map(value).join(' / ');
  const tokens = [record.tokens.input, record.tokens.output, record.tokens.cached, record.tokens.thinking]
    .map(value)
    .join(' / ');
  return (
    <div className='h-full overflow-auto p-16px' data-testid='conversation-trajectory-inspector'>
      <Typography.Title heading={6}>
        {record.title || t(`conversation.trajectory.category.${record.category}`)}
      </Typography.Title>
      <Descriptions
        colon=':'
        column={1}
        data={[
          {
            label: t('conversation.trajectory.inspector.status'),
            value: t(`conversation.trajectory.status.${record.status}`),
          },
          { label: t('conversation.trajectory.inspector.timing'), value: timing },
          { label: t('conversation.trajectory.inspector.tokens'), value: tokens },
          { label: t('conversation.trajectory.inspector.turn'), value: value(record.turn_id) },
          { label: t('conversation.trajectory.inspector.step'), value: value(record.step_id) },
          { label: t('conversation.trajectory.inspector.sources'), value: record.source_sequences.join(', ') },
          ...(record.error_code
            ? [{ label: t('conversation.trajectory.inspector.errorCode'), value: record.error_code }]
            : []),
          ...(record.truncation !== undefined
            ? [{ label: t('conversation.trajectory.inspector.truncation'), value: value(record.truncation) }]
            : []),
          ...(record.retained_output_reference
            ? [
                {
                  label: t('conversation.trajectory.inspector.retainedOutput'),
                  value: record.retained_output_reference,
                },
              ]
            : []),
        ]}
      />
      {record.input_preview && (
        <section className='mt-16px'>
          <Typography.Title heading={6}>{t('conversation.trajectory.inspector.input')}</Typography.Title>
          <Typography.Paragraph className='whitespace-pre-wrap break-words'>
            {record.input_preview}
          </Typography.Paragraph>
        </section>
      )}
      {(retainedOutput !== null || record.output_preview || record.retained_output_reference) && (
        <section className='mt-16px'>
          <Typography.Title heading={6}>{t('conversation.trajectory.inspector.output')}</Typography.Title>
          <Typography.Paragraph className='whitespace-pre-wrap break-words'>
            {retainedOutput ?? record.output_preview}
          </Typography.Paragraph>
          {record.retained_output_reference && retainedOutput === null && (
            <Button
              size='mini'
              type='outline'
              loading={loadingRetainedOutput}
              data-testid='conversation-trajectory-load-retained-output'
              onClick={() => void loadRetainedOutput()}
            >
              {t('conversation.trajectory.inspector.loadRetainedOutput')}
            </Button>
          )}
        </section>
      )}
      {record.structured_content !== undefined && (
        <section className='mt-16px'>
          <Typography.Title heading={6}>{t('conversation.trajectory.inspector.structuredContent')}</Typography.Title>
          <pre className='text-11px whitespace-pre-wrap break-all bg-bg-2 rd-6px p-10px'>
            {value(record.structured_content)}
          </pre>
        </section>
      )}
      {record.detail !== undefined && (
        <section className='mt-16px'>
          <Typography.Title heading={6}>{t('conversation.trajectory.inspector.detail')}</Typography.Title>
          <pre className='text-11px whitespace-pre-wrap break-all bg-bg-2 rd-6px p-10px'>{value(record.detail)}</pre>
        </section>
      )}
    </div>
  );
};

export default TrajectoryInspector;
