import { ipcBridge } from '@/common';
import { TASK_RETRY_MAX_ATTEMPTS, TASK_RUN_TIMEOUT_MAX_MS } from '@/common/types/agent/taskSession';
import { Button, InputNumber, Message, Space, Switch, Typography } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { buildRetryPolicy, retryPolicySupported, timeoutMsToMinutes } from './taskRetryPolicyModel';

type Props = { taskId: string; visible: boolean };

/**
 * Retry / timeout policy for approved execution runs (aioncore ≥ M7 E5-5).
 * Renders nothing on older cores, which do not report `retry_max_attempts`.
 */
const TaskRetryPolicyControl: React.FC<Props> = ({ taskId, visible }) => {
  const { t } = useTranslation();
  const { data: task, mutate } = useSWR(visible ? ['taskRetryPolicy', taskId] : null, () =>
    ipcBridge.taskSession.get.invoke({ id: taskId })
  );
  const [enabled, setEnabled] = useState(false);
  const [attempts, setAttempts] = useState(2);
  const [timeoutMinutes, setTimeoutMinutes] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!retryPolicySupported(task)) return;
    setEnabled(task.retry_max_attempts > 1);
    setAttempts(Math.max(2, task.retry_max_attempts));
    setTimeoutMinutes(timeoutMsToMinutes(task.retry_timeout_ms));
  }, [task]);

  if (!retryPolicySupported(task)) return null;

  const save = async () => {
    setSaving(true);
    try {
      const updated = await ipcBridge.taskSession.retryPolicy.update.invoke({
        id: taskId,
        ...buildRetryPolicy(enabled, attempts, timeoutMinutes),
      });
      await mutate(updated, { revalidate: false });
      Message.success(t('conversation.taskSession.retry.saved'));
    } catch (error) {
      console.error('[TaskRetryPolicy] Failed to save:', error);
      Message.error(t('conversation.taskSession.retry.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space wrap size={12} className='w-full' data-testid='task-retry-policy'>
      <Space size={6}>
        <Switch
          size='small'
          checked={enabled}
          onChange={setEnabled}
          aria-label={t('conversation.taskSession.retry.enable')}
        />
        <Typography.Text>{t('conversation.taskSession.retry.enable')}</Typography.Text>
      </Space>
      {enabled ? (
        <Space size={6}>
          <Typography.Text type='secondary'>{t('conversation.taskSession.retry.maxAttempts')}</Typography.Text>
          <InputNumber
            size='small'
            className='w-80px'
            min={2}
            max={TASK_RETRY_MAX_ATTEMPTS}
            precision={0}
            value={attempts}
            onChange={(value) => setAttempts(Number(value) || 2)}
            aria-label={t('conversation.taskSession.retry.maxAttempts')}
          />
        </Space>
      ) : null}
      <Space size={6}>
        <Typography.Text type='secondary'>{t('conversation.taskSession.retry.timeout')}</Typography.Text>
        <InputNumber
          size='small'
          className='w-100px'
          min={1}
          max={TASK_RUN_TIMEOUT_MAX_MS / 60_000}
          precision={0}
          value={timeoutMinutes}
          placeholder={t('conversation.taskSession.retry.noTimeout')}
          onChange={(value) => setTimeoutMinutes(value === undefined || value === null ? undefined : Number(value))}
          aria-label={t('conversation.taskSession.retry.timeout')}
        />
      </Space>
      <Button size='small' type='primary' loading={saving} onClick={() => void save()}>
        {t('common.save')}
      </Button>
      <Typography.Text type='secondary'>{t('conversation.taskSession.retry.hint')}</Typography.Text>
    </Space>
  );
};

export default TaskRetryPolicyControl;
